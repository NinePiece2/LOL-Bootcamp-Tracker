import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getTwitchClient } from '@/lib/twitch-api';
import { getRiotClient } from '@/lib/riot-api';
import { auth } from '@/lib/auth';

const updateBootcamperSchema = z.object({
  name: z.string().optional(),
  riotId: z.string().optional(),
  twitchLogin: z.string().optional(),
  role: z.enum(['pro', 'streamer', 'rookie']).optional(),
  startDate: z.string().or(z.date()).optional(),
  plannedEndDate: z.string().or(z.date()).optional(),
  actualEndDate: z.string().or(z.date()).nullable().optional(),
  status: z.enum(['idle', 'in_game']).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const bootcamper = await prisma.bootcamper.findUnique({
      where: { id },
      include: {
        games: {
          orderBy: { startedAt: 'desc' },
          take: 10,
        },
        twitchStreams: {
          orderBy: { startedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!bootcamper) {
      return NextResponse.json(
        { error: 'Bootcamper not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(bootcamper);
  } catch (error) {
    console.error('Error fetching bootcamper:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bootcamper' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const data = updateBootcamperSchema.parse(body);

    // Check if bootcamper exists
    const existing = await prisma.bootcamper.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Bootcamper not found' },
        { status: 404 }
      );
    }

    // Check authorization - user can only edit their own bootcampers unless they're admin
    // Only admins can edit default bootcampers or change admin-only fields
    if (existing.isDefault && !session.user.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden - only admins can edit default bootcampers' },
        { status: 403 }
      );
    }

    // Non-admins can only edit bootcampers they own
    if (!session.user.isAdmin && existing.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden - you can only edit your own bootcampers' },
        { status: 403 }
      );
    }

    // Handle Riot ID changes
    let newPuuid: string | undefined;
    let newSummonerName: string | undefined;
    const riotIdChanged = data.riotId && data.riotId !== existing.riotId;

    if (riotIdChanged) {
      // Parse Riot ID (format: "gameName#tagLine")
      const [gameName, tagLine] = data.riotId!.split('#');
      
      if (!gameName || !tagLine) {
        return NextResponse.json(
          { error: 'Invalid Riot ID format. Expected format: gameName#tagLine' },
          { status: 400 }
        );
      }

      try {
        const riotClient = getRiotClient();
        
        // Get account info from Riot ID
        const account = await riotClient.getAccountByRiotId('asia', gameName, tagLine);
        
        if (!account) {
          return NextResponse.json(
            { error: 'Riot account not found' },
            { status: 404 }
          );
        }

        newPuuid = account.puuid;

        // Get summoner info to get the current summoner name
        const summoner = await riotClient.getSummonerByPuuid('kr', account.puuid);
        
        if (!summoner) {
          return NextResponse.json(
            { error: 'Summoner not found on KR server' },
            { status: 404 }
          );
        }

        newSummonerName = summoner.name;
        
        console.log(`🎮 Riot ID updated for bootcamper ${existing.summonerName}: ${data.riotId} (PUUID: ${newPuuid}, Summoner: ${newSummonerName})`);
      } catch (error) {
        console.error('Error fetching Riot account:', error);
        return NextResponse.json(
          { error: 'Failed to fetch Riot account information' },
          { status: 500 }
        );
      }
    }

    // Handle Twitch account changes
    let twitchUserId: string | undefined;
    let twitchProfileImage: Buffer | undefined;
    const twitchChanged = data.twitchLogin && data.twitchLogin !== existing.twitchLogin;

    if (twitchChanged) {
      const twitchClient = getTwitchClient();
      const users = await twitchClient.getUsersByLogin([data.twitchLogin!]);
      
      if (users.length === 0) {
        return NextResponse.json(
          { error: 'Twitch user not found' },
          { status: 404 }
        );
      }

      twitchUserId = users[0].id;

      // Fetch profile image
      const imageResponse = await fetch(users[0].profile_image_url);
      const imageBuffer = await imageResponse.arrayBuffer();
      twitchProfileImage = Buffer.from(imageBuffer);
      
      // Note: Worker sync will automatically update Twitch jobs within 2 minutes
    }

    // Update bootcamper
    const bootcamper = await prisma.bootcamper.update({
      where: { id },
      data: {
        // Prevent non-admins from changing admin-only fields
        ...(data.name !== undefined && { name: data.name || null }),
        ...(data.riotId !== undefined && { riotId: data.riotId || null }),
        ...(newPuuid && { puuid: newPuuid }),
        ...(newSummonerName && { summonerName: newSummonerName }),
        ...(data.twitchLogin !== undefined && { twitchLogin: data.twitchLogin }),
        ...(twitchUserId && { twitchUserId }),
        ...(twitchProfileImage && { twitchProfileImage }),
        // Role changes reserved for admins
        ...(session.user.isAdmin && data.role !== undefined && { role: data.role }),
        ...(data.startDate !== undefined && {
          startDate: new Date(data.startDate),
        }),
        ...(data.plannedEndDate !== undefined && {
          plannedEndDate: new Date(data.plannedEndDate),
        }),
        ...(data.actualEndDate !== undefined && {
          actualEndDate: data.actualEndDate ? new Date(data.actualEndDate) : null,
        }),
        // Only admins may set status (to avoid spoofing in user's list)
        ...(session.user.isAdmin && data.status !== undefined && { status: data.status }),
      },
    });

    // Note: Worker sync will automatically pick up any changes within 2 minutes
    if (riotIdChanged) {
      console.log(`✅ Riot account updated for ${bootcamper.summonerName}. Jobs will use new PUUID on next run.`);
    }
    if (twitchChanged) {
      console.log(`✅ Twitch account updated for ${bootcamper.summonerName}. Worker will sync jobs within 2 minutes.`);
    }

    return NextResponse.json(bootcamper);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error updating bootcamper:', error);
    return NextResponse.json(
      { error: 'Failed to update bootcamper' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    
    // Check if bootcamper exists
    const existing = await prisma.bootcamper.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Bootcamper not found' },
        { status: 404 }
      );
    }

    // Check authorization - user can only delete their own bootcampers unless they're admin
    if (existing.userId !== session.user.id && !session.user.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden - you can only delete your own bootcampers' },
        { status: 403 }
      );
    }

    // Delete bootcamper (jobs will be cleaned up by sync process)
    await prisma.bootcamper.delete({
      where: { id },
    });

    console.log(`🗑️  Deleted bootcamper: ${existing.summonerName} (ID: ${id})`);
    console.log(`Note: Worker jobs will be cleaned up in next sync cycle`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting bootcamper:', error);
    return NextResponse.json(
      { error: 'Failed to delete bootcamper' },
      { status: 500 }
    );
  }
}
