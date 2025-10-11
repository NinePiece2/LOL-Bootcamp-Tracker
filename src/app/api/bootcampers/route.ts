import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getRiotClient } from '@/lib/riot-api';
import { getTwitchClient } from '@/lib/twitch-api';
import { RiotRegion } from '@/lib/types';
import { auth } from '@/lib/auth';

const createBootcamperSchema = z.object({
  name: z.string().optional(),
  summonerName: z.string().optional(), // Made optional for default bootcamper selection
  region: z.string().optional(), // Made optional for default bootcamper selection
  twitchLogin: z.string().optional(),
  role: z.enum(['pro', 'streamer', 'rookie']).optional(),
  startDate: z.string().or(z.date()),
  plannedEndDate: z.string().or(z.date()),
  listType: z.enum(['default', 'user']).optional(),
  defaultBootcamperId: z.string().optional(), // For selecting from default list
}).refine((data) => {
  // Either defaultBootcamperId OR summonerName+region must be provided
  return data.defaultBootcamperId || (data.summonerName && data.region);
}, {
  message: "Either defaultBootcamperId or summonerName+region must be provided"
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

    // If defaultBootcamperId is provided, user is selecting from default list
    if (data.defaultBootcamperId) {
      console.log('Creating user association to default bootcamper:', data.defaultBootcamperId);

      // Fetch the default bootcamper (canonical)
      const defaultBootcamper = await prisma.bootcamper.findUnique({
        where: { id: data.defaultBootcamperId },
      });

      if (!defaultBootcamper || !defaultBootcamper.isDefault) {
        return NextResponse.json({ error: 'Default bootcamper not found' }, { status: 404 });
      }

      // Try to create an association via user_bootcampers. If the table doesn't exist yet
      // (migration not applied), fall back to the legacy behavior of creating a duplicated bootcamper row
      try {
        // Prevent duplicate association
        const existingAssoc = await prisma.userBootcamper.findFirst({
          where: { userId: session.user.id, bootcamperId: defaultBootcamper.id },
        });

        if (existingAssoc) {
          return NextResponse.json({ error: 'This bootcamper is already in your list' }, { status: 400 });
        }

        const assoc = await prisma.userBootcamper.create({
          data: {
            userId: session.user.id,
            bootcamperId: defaultBootcamper.id,
            nameOverride: data.name || null,
            startDate: new Date(data.startDate),
            plannedEndDate: new Date(data.plannedEndDate),
          },
        });

        // Return canonical bootcamper data augmented with association details for frontend
        const responseObj = {
          ...defaultBootcamper,
          name: assoc.nameOverride || defaultBootcamper.name,
          startDate: assoc.startDate instanceof Date ? assoc.startDate.toISOString() : new Date(assoc.startDate).toISOString(),
          plannedEndDate: assoc.plannedEndDate ? (assoc.plannedEndDate instanceof Date ? assoc.plannedEndDate.toISOString() : new Date(assoc.plannedEndDate).toISOString()) : null,
          isDefault: false,
          userId: session.user.id,
          userAssociationId: assoc.id,
          linkedToDefaultId: defaultBootcamper.id,
        };

        return NextResponse.json(responseObj, { status: 201 });
      } catch (err: unknown) {
        const maybe = err as { code?: string; message?: unknown } | undefined;
        if (maybe?.code === 'P2021' || (maybe?.message && String(maybe.message).includes('user_bootcampers'))) {
          // Fallback: create a user-specific bootcamper row (legacy behavior)
          const userReference = await prisma.bootcamper.create({
            data: {
              name: data.name || defaultBootcamper.name,
              summonerName: defaultBootcamper.summonerName,
              summonerId: defaultBootcamper.summonerId,
              puuid: defaultBootcamper.puuid,
              region: defaultBootcamper.region,
              riotId: defaultBootcamper.riotId,
              twitchLogin: defaultBootcamper.twitchLogin,
              twitchUserId: defaultBootcamper.twitchUserId,
              twitchProfileImage: defaultBootcamper.twitchProfileImage,
              role: defaultBootcamper.role, // Use default role, don't allow override
              startDate: new Date(data.startDate),
              plannedEndDate: new Date(data.plannedEndDate),
              status: defaultBootcamper.status, // Sync status with default
              isDefault: false,
              userId: session.user.id,
              linkedToDefaultId: defaultBootcamper.id, // Link to avoid duplicate workers
              // Copy current rank data
              currentSoloTier: defaultBootcamper.currentSoloTier,
              currentSoloRank: defaultBootcamper.currentSoloRank,
              currentSoloLP: defaultBootcamper.currentSoloLP,
              currentSoloWins: defaultBootcamper.currentSoloWins,
              currentSoloLosses: defaultBootcamper.currentSoloLosses,
              currentFlexTier: defaultBootcamper.currentFlexTier,
              currentFlexRank: defaultBootcamper.currentFlexRank,
              currentFlexLP: defaultBootcamper.currentFlexLP,
              currentFlexWins: defaultBootcamper.currentFlexWins,
              currentFlexLosses: defaultBootcamper.currentFlexLosses,
              rankUpdatedAt: defaultBootcamper.rankUpdatedAt,
              // Copy peak rank data
              peakSoloTier: defaultBootcamper.peakSoloTier,
              peakSoloRank: defaultBootcamper.peakSoloRank,
              peakSoloLP: defaultBootcamper.peakSoloLP,
              peakFlexTier: defaultBootcamper.peakFlexTier,
              peakFlexRank: defaultBootcamper.peakFlexRank,
              peakFlexLP: defaultBootcamper.peakFlexLP,
              peakUpdatedAt: defaultBootcamper.peakUpdatedAt,
            },
          });

          console.log(`✅ Created user reference to default bootcamper (legacy fallback): ${userReference.summonerName}`);
          console.log(`   Linked ID: ${defaultBootcamper.id} → User bootcamper ID: ${userReference.id}`);

          return NextResponse.json(userReference, { status: 201 });
        }

        throw err;
      }
    }

    // Rest of the existing code for creating new bootcampers...
    // (The rest remains the same)
    
    // Rest of the code for creating new bootcampers (when not selecting from default list)
    // Fetch summoner info from Riot API
    const riotClient = getRiotClient();
    let summoner;
    let riotId: string | null = null;
    let summonerName: string;

    try {
      // Only use Riot ID format (gameName#tagLine)
      summoner = await riotClient.getSummonerByRiotId(
        data.region as RiotRegion,
        data.summonerName!
      );
      console.log('✅ Used Riot ID format successfully');
      console.log('Summoner data:', summoner);

      // Store the full Riot ID with tag
      riotId = data.summonerName!.includes('#') 
        ? data.summonerName! 
        : `${data.summonerName!}#${(data.region as string).toUpperCase()}`;

      // Extract summoner name from Riot ID or use API response
      summonerName = summoner.name || (riotId.includes('#') ? riotId.split('#')[0] : riotId);
    } catch (error) {
      // If Riot ID lookup fails, return error
      console.error('Failed to fetch summoner by Riot ID:', error);
      return NextResponse.json(
        { error: 'Failed to fetch summoner by Riot ID. Please use the correct format (gameName#tagLine).' },
        { status: 400 }
      );
    }

    // Fetch Twitch info if provided
    let twitchUserId: string | undefined;
    let twitchProfileImage: Buffer | undefined;
    if (data.twitchLogin) {
      const twitchClient = getTwitchClient();
      const twitchUser = await twitchClient.getUserByLogin(data.twitchLogin);
      if (twitchUser) {
        twitchUserId = twitchUser.id;

        // Fetch and store profile image
        if (twitchUser.profile_image_url) {
          try {
            const imageResponse = await fetch(twitchUser.profile_image_url);
            if (imageResponse.ok) {
              const arrayBuffer = await imageResponse.arrayBuffer();
              twitchProfileImage = Buffer.from(arrayBuffer);
              console.log('✅ Downloaded Twitch profile image');
            }
          } catch (error) {
            console.error('Failed to download Twitch profile image:', error);
          }
        }
      }
    }

    // Check if this bootcamper already exists in the default list
    const existingDefaultBootcamper = await prisma.bootcamper.findFirst({
      where: {
        puuid: summoner.puuid,
        isDefault: true,
      },
    });

    if (existingDefaultBootcamper && !session.user.isAdmin) {
      // User is trying to add someone who's already in the default list
      // Create a reference to the default bootcamper instead (no duplicate workers)
      console.log(`📌 Found existing default bootcamper: ${existingDefaultBootcamper.summonerName}`);

      const userReference = await prisma.bootcamper.create({
        data: {
          name: data.name || existingDefaultBootcamper.name,
          summonerName: existingDefaultBootcamper.summonerName,
          summonerId: existingDefaultBootcamper.summonerId,
          puuid: existingDefaultBootcamper.puuid,
          region: existingDefaultBootcamper.region,
          riotId: existingDefaultBootcamper.riotId,
          twitchLogin: existingDefaultBootcamper.twitchLogin,
          twitchUserId: existingDefaultBootcamper.twitchUserId,
          twitchProfileImage: existingDefaultBootcamper.twitchProfileImage,
          role: data.role || existingDefaultBootcamper.role,
          startDate: new Date(data.startDate),
          plannedEndDate: new Date(data.plannedEndDate),
          status: existingDefaultBootcamper.status, // Sync status with default
          isDefault: false,
          userId: session.user.id,
          linkedToDefaultId: existingDefaultBootcamper.id, // Link to avoid duplicate workers
          // Copy current rank data
          currentSoloTier: existingDefaultBootcamper.currentSoloTier,
          currentSoloRank: existingDefaultBootcamper.currentSoloRank,
          currentSoloLP: existingDefaultBootcamper.currentSoloLP,
          currentSoloWins: existingDefaultBootcamper.currentSoloWins,
          currentSoloLosses: existingDefaultBootcamper.currentSoloLosses,
          currentFlexTier: existingDefaultBootcamper.currentFlexTier,
          currentFlexRank: existingDefaultBootcamper.currentFlexRank,
          currentFlexLP: existingDefaultBootcamper.currentFlexLP,
          currentFlexWins: existingDefaultBootcamper.currentFlexWins,
          currentFlexLosses: existingDefaultBootcamper.currentFlexLosses,
          rankUpdatedAt: existingDefaultBootcamper.rankUpdatedAt,
          // Copy peak rank data
          peakSoloTier: existingDefaultBootcamper.peakSoloTier,
          peakSoloRank: existingDefaultBootcamper.peakSoloRank,
          peakSoloLP: existingDefaultBootcamper.peakSoloLP,
          peakFlexTier: existingDefaultBootcamper.peakFlexTier,
          peakFlexRank: existingDefaultBootcamper.peakFlexRank,
          peakFlexLP: existingDefaultBootcamper.peakFlexLP,
          peakUpdatedAt: existingDefaultBootcamper.peakUpdatedAt,
        },
      });

      console.log(`✅ Created user reference to default bootcamper (no duplicate workers): ${userReference.summonerName}`);
      console.log(`   Linked ID: ${existingDefaultBootcamper.id} → User bootcamper ID: ${userReference.id}`);

      return NextResponse.json(userReference, { status: 201 });
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
      region: data.region!,
      twitchLogin: data.twitchLogin,
      twitchUserId,
      twitchProfileImage,
      role: data.role,
      name: data.name || null,
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

    // Note: Worker jobs will be automatically added by the periodic sync in the worker process
    // This happens within 10 seconds of creation, then checks every 2 minutes
    console.log(`✅ Bootcamper created. Worker process will pick it up within 10 seconds.`);

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
        // Return user's personal list via association table
        console.log('Fetching user bootcampers (via associations) for userId:', session.user.id);

        type UserBootcamperAssoc = {
          id: string;
          nameOverride?: string | null;
          startDate: Date;
          plannedEndDate?: Date | null;
          bootcamper: Record<string, unknown>;
        };

        let associations: UserBootcamperAssoc[];
        try {
          associations = await prisma.userBootcamper.findMany({
            where: { userId: session.user.id },
            include: {
            bootcamper: {
              select: {
                id: true,
                riotId: true,
                summonerName: true,
                summonerId: true,
                puuid: true,
                region: true,
                twitchLogin: true,
                twitchUserId: true,
                role: true,
                startDate: true,
                plannedEndDate: true,
                actualEndDate: true,
                status: true,
                lastGameId: true,
                createdAt: true,
                updatedAt: true,
                name: true,
                isDefault: true,
                userId: true,
                peakSoloTier: true,
                peakSoloRank: true,
                peakSoloLP: true,
                peakFlexTier: true,
                peakFlexRank: true,
                peakFlexLP: true,
                peakUpdatedAt: true,
                currentSoloTier: true,
                currentSoloRank: true,
                currentSoloLP: true,
                currentSoloWins: true,
                currentSoloLosses: true,
                currentFlexTier: true,
                currentFlexRank: true,
                currentFlexLP: true,
                currentFlexWins: true,
                currentFlexLosses: true,
                rankUpdatedAt: true,
                linkedToDefaultId: true,
                games: {
                  where: { status: { in: ['live', 'in_progress'] } },
                  orderBy: { startedAt: 'desc' },
                  take: 1,
                },
                twitchStreams: {
                  where: { live: true },
                  orderBy: { startedAt: 'desc' },
                  take: 1,
                },
              }
            }
          },
        });

        const userBootcampers = associations.map((a: UserBootcamperAssoc) => {
          const b = a.bootcamper as Record<string, unknown>;
          const isDefault = Boolean(b['isDefault']);
          const bootId = typeof b['id'] === 'string' ? (b['id'] as string) : null;
          return {
            ...b,
            name: a.nameOverride || (b['name'] as string | null),
            startDate: a.startDate.toISOString(),
            plannedEndDate: a.plannedEndDate ? a.plannedEndDate.toISOString() : null,
            isDefault: false,
            userId: session.user.id,
            userAssociationId: a.id,
            linkedToDefaultId: isDefault ? bootId : null,
          };
        });

        return NextResponse.json(userBootcampers);
        } catch (err: unknown) {
          // If the association table doesn't exist yet (migration not applied), fall back
          // to the original behavior: query bootcampers where userId = session.user.id
          const maybeErr = err as { code?: string; message?: unknown } | undefined;
          if (maybeErr?.code === 'P2021' || (maybeErr?.message && String(maybeErr.message).includes('user_bootcampers'))) {
            console.warn('user_bootcampers table not found, falling back to legacy user bootcamper query');
            const fallbackBootcampers = await prisma.bootcamper.findMany({
              where: { userId: session.user.id, isDefault: false },
              select: {
                id: true,
                riotId: true,
                summonerName: true,
                summonerId: true,
                puuid: true,
                region: true,
                twitchLogin: true,
                twitchUserId: true,
                role: true,
                startDate: true,
                plannedEndDate: true,
                actualEndDate: true,
                status: true,
                lastGameId: true,
                createdAt: true,
                updatedAt: true,
                name: true,
                isDefault: true,
                userId: true,
                peakSoloTier: true,
                peakSoloRank: true,
                peakSoloLP: true,
                peakFlexTier: true,
                peakFlexRank: true,
                peakFlexLP: true,
                peakUpdatedAt: true,
                currentSoloTier: true,
                currentSoloRank: true,
                currentSoloLP: true,
                currentSoloWins: true,
                currentSoloLosses: true,
                currentFlexTier: true,
                currentFlexRank: true,
                currentFlexLP: true,
                currentFlexWins: true,
                currentFlexLosses: true,
                rankUpdatedAt: true,
                linkedToDefaultId: true,
                games: {
                  where: { status: { in: ['live', 'in_progress'] } },
                  orderBy: { startedAt: 'desc' },
                  take: 1,
                },
                twitchStreams: {
                  where: { live: true },
                  orderBy: { startedAt: 'desc' },
                  take: 1,
                },
              }
            });

            return NextResponse.json(fallbackBootcampers.map(b => ({
              ...b,
              userAssociationId: null,
            })));
          }

          throw err;
        }
      }
    } else {
      // Unauthenticated user - only show default bootcampers
      where.isDefault = true;
      console.log('Unauthenticated user - fetching default bootcampers');
    }

    console.log('Final where clause:', where);

    const bootcampers = await prisma.bootcamper.findMany({
      where,
      select: {
        id: true,
        riotId: true,
        summonerName: true,
        summonerId: true,
        puuid: true,
        region: true,
        twitchLogin: true,
        twitchUserId: true,
        // Exclude twitchProfileImage - only needed for leaderboard
        role: true,
        startDate: true,
        plannedEndDate: true,
        actualEndDate: true,
        status: true,
        lastGameId: true,
        createdAt: true,
        updatedAt: true,
        name: true,
        isDefault: true,
        userId: true,
        peakSoloTier: true,
        peakSoloRank: true,
        peakSoloLP: true,
        peakFlexTier: true,
        peakFlexRank: true,
        peakFlexLP: true,
        peakUpdatedAt: true,
        currentSoloTier: true,
        currentSoloRank: true,
        currentSoloLP: true,
        currentSoloWins: true,
        currentSoloLosses: true,
        currentFlexTier: true,
        currentFlexRank: true,
        currentFlexLP: true,
        currentFlexWins: true,
        currentFlexLosses: true,
        rankUpdatedAt: true,
        linkedToDefaultId: true,
        games: {
          where: { 
            status: { 
              in: ['live', 'in_progress'] // Support both old and new status values
            } 
          },
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

    // For user references, fetch games and streams from their linked default bootcampers
    const enrichedBootcampers = await Promise.all(
      bootcampers.map(async (bootcamper) => {
        // If this bootcamper points to a canonical/default bootcamper, ALWAYS source the latest live/game/stream
        // data from the canonical record so user lists mirror default list behavior.
        if (bootcamper.linkedToDefaultId) {
          try {
            const defaultBoot = await prisma.bootcamper.findUnique({
              where: { id: bootcamper.linkedToDefaultId },
              select: {
                games: {
                  where: { status: { in: ['live', 'in_progress'] } },
                  orderBy: { startedAt: 'desc' },
                  take: 1,
                },
                twitchStreams: {
                  where: { live: true },
                  orderBy: { startedAt: 'desc' },
                  take: 1,
                },
                status: true,
                lastGameId: true,
                twitchLogin: true,
                twitchUserId: true,
                puuid: true,
                riotId: true,
                summonerName: true,
                name: true,
              },
            });

            return {
              ...bootcamper,
              // override with canonical's live/game/stream data so UI (LiveGamesSection, dashboard)
              // renders identical data for default and user views
              games: defaultBoot?.games || [],
              twitchStreams: defaultBoot?.twitchStreams || [],
              status: defaultBoot?.status ?? bootcamper.status,
              lastGameId: defaultBoot?.lastGameId ?? bootcamper.lastGameId,
              // keep original name override, but ensure summoner/puuid/riotId are available
              summonerName: bootcamper.summonerName || (defaultBoot?.summonerName ?? bootcamper.summonerName),
              riotId: bootcamper.riotId || (defaultBoot?.riotId ?? bootcamper.riotId),
              puuid: bootcamper.puuid || (defaultBoot?.puuid ?? bootcamper.puuid),
              twitchLogin: bootcamper.twitchLogin || (defaultBoot?.twitchLogin ?? bootcamper.twitchLogin),
              twitchUserId: bootcamper.twitchUserId || (defaultBoot?.twitchUserId ?? bootcamper.twitchUserId),
            };
          } catch (err) {
            console.error('Error enriching user bootcamper from default:', err);
            // fallback to original object
            return bootcamper;
          }
        }

        return bootcamper;
      })
    );

    return NextResponse.json(enrichedBootcampers);
  } catch (error) {
    console.error('Error fetching bootcampers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bootcampers' },
      { status: 500 }
    );
  }
}
