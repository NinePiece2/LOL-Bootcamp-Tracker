import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getRiotClient } from '@/lib/riot-api';
import { getTwitchClient } from '@/lib/twitch-api';
import { RiotRegion } from '@/lib/types';
import { auth } from '@/lib/auth';

const createBootcamperSchema = z.object({
  name: z.string().optional(),
  summonerName: z.string().min(1),
  region: z.string().min(1),
  twitchLogin: z.string().optional(),
  role: z.enum(['pro', 'streamer', 'rookie']).optional(),
  startDate: z.string().or(z.date()),
  plannedEndDate: z.string().or(z.date()),
  listType: z.enum(['default', 'user']).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const data = createBootcamperSchema.parse(body);

    // Fetch summoner info from Riot API
    const riotClient = getRiotClient();
    let summoner;
    let riotId: string | null = null;
    let summonerName: string;
    
    try {
      // Try new Riot ID format first (gameName#tagLine)
      summoner = await riotClient.getSummonerByRiotId(
        data.region as RiotRegion,
        data.summonerName
      );
      console.log('✅ Used Riot ID format successfully');
      console.log('Summoner data:', summoner);
      
      // Store the full Riot ID with tag
      riotId = data.summonerName.includes('#') 
        ? data.summonerName 
        : `${data.summonerName}#${(data.region as string).toUpperCase()}`;
      
      // Extract summoner name from Riot ID or use API response
      summonerName = summoner.name || (riotId.includes('#') ? riotId.split('#')[0] : riotId);
    } catch {
      // Fall back to old summoner name lookup (may be deprecated)
      console.log('Trying legacy summoner name lookup...');
      summoner = await riotClient.getSummonerByName(
        data.region as RiotRegion,
        data.summonerName
      );
      console.log('✅ Used legacy summoner name lookup');
      console.log('Summoner data:', summoner);
      summonerName = summoner.name || data.summonerName;
    }

    // Fetch Twitch info if provided
    let twitchUserId: string | undefined;
    if (data.twitchLogin) {
      const twitchClient = getTwitchClient();
      const twitchUser = await twitchClient.getUserByLogin(data.twitchLogin);
      if (twitchUser) {
        twitchUserId = twitchUser.id;
      }
    }

    // Create bootcamper in database
    // Determine if this should be a default bootcamper based on user permissions and listType
    console.log('Creating bootcamper - listType:', data.listType);
    console.log('User is admin:', session.user.isAdmin);
    
    let isDefaultBootcamper = false;
    const userId = session.user.id;
    
    if (session.user.isAdmin) {
      // Admins can create default bootcampers or personal ones based on listType
      if (data.listType === 'default') {
        isDefaultBootcamper = true;
        // For default bootcampers, we still track which admin created them
        // but they appear in the default list
      } else {
        // Admin creating a personal bootcamper
        isDefaultBootcamper = false;
      }
    } else {
      // Regular users can only create personal bootcampers
      isDefaultBootcamper = false;
      // Ignore listType for regular users - they can only create personal bootcampers
    }
    
    console.log('Final bootcamper settings:', { 
      isDefaultBootcamper, 
      userId, 
      requestedListType: data.listType 
    });
    
    const bootcamperData = {
      riotId,
      summonerName,
      summonerId: summoner.id || null,
      puuid: summoner.puuid,
      region: data.region,
      twitchLogin: data.twitchLogin,
      twitchUserId,
      role: data.role,
      startDate: new Date(data.startDate),
      plannedEndDate: new Date(data.plannedEndDate),
      userId: userId, // Link to user
      isDefault: isDefaultBootcamper, // Set based on permissions and listType
    };

    const bootcamper = await prisma.bootcamper.create({
      data: bootcamperData,
    });

    console.log('Created bootcamper:', { 
      id: bootcamper.id, 
      isDefaultFromData: isDefaultBootcamper, 
      userIdFromData: userId 
    });

    return NextResponse.json(bootcamper, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error creating bootcamper:', error);
    return NextResponse.json(
      { error: 'Failed to create bootcamper' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const role = searchParams.get('role');
    const region = searchParams.get('region');
    const listType = searchParams.get('listType'); // 'default' or 'user'

    const where: Record<string, unknown> = {};
    if (status) where.status = status as 'idle' | 'in_game';
    if (role) where.role = role as 'pro' | 'streamer' | 'rookie';
    if (region) where.region = region;

    // Determine which bootcampers to show
    console.log('GET /api/bootcampers - Query params:', { listType, status, role, region });
    console.log('Session user:', { id: session?.user?.id, isAdmin: session?.user?.isAdmin });
    
    if (session?.user) {
      // Authenticated user
      if (listType === 'default' || !listType) {
        // Show default bootcampers (admin-created)
        where.isDefault = true;
        console.log('Fetching default bootcampers (isDefault = true)');
      } else if (listType === 'user') {
        // Show user's own bootcampers
        where.userId = session.user.id;
        where.isDefault = false;
        console.log('Fetching user bootcampers for userId:', session.user.id);
      }
    } else {
      // Unauthenticated user - only show default bootcampers
      where.isDefault = true;
      console.log('Unauthenticated user - fetching default bootcampers');
    }

    console.log('Final where clause:', where);

    const bootcampers = await prisma.bootcamper.findMany({
      where,
      include: {
        games: {
          where: { status: 'live' },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
        twitchStreams: {
          where: { live: true },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(bootcampers);
  } catch (error) {
    console.error('Error fetching bootcampers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bootcampers' },
      { status: 500 }
    );
  }
}
