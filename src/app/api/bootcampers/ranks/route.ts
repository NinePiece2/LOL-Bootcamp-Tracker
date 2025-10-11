import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import sharp from 'sharp';

// // Use a lightweight local type for bootcamper with games to avoid Prisma helper type issues
// type BootcamperWithGames = {
//   id: string;
//   riotId: string | null;
//   summonerName: string;
//   name: string | null;
//   summonerId: string | null;
//   puuid: string | null;
//   region: string;
//   twitchLogin: string | null;
//   twitchUserId: string | null;
//   twitchProfileImage: Uint8Array | null;
//   role: string | null;
//   startDate: string | Date;
//   plannedEndDate: string | Date | null;
//   actualEndDate: string | Date | null;
//   status: string;
//   peakSoloTier: string | null;
//   peakSoloRank: string | null;
//   peakSoloLP: number | null;
//   peakFlexTier: string | null;
//   peakFlexRank: string | null;
//   peakFlexLP: number | null;
//   peakUpdatedAt: Date | null;
//   currentSoloTier: string | null;
//   currentSoloRank: string | null;
//   currentSoloLP: number | null;
//   currentSoloWins: number | null;
//   currentSoloLosses: number | null;
//   currentFlexTier: string | null;
//   currentFlexRank: string | null;
//   currentFlexLP: number | null;
//   currentFlexWins: number | null;
//   currentFlexLosses: number | null;
//   rankUpdatedAt: Date | null;
//   games: Array<{
//     id: string;
//     riotGameId: string;
//     bootcamperId: string;
//     startedAt: string | Date;
//     endedAt: string | Date | null;
//     status: string;
//   }>;
// };

// Cache for compressed images
const imageCache = new Map<string, string>();

/**
 * Compress and cache Twitch profile image
 */
async function compressProfileImage(imageBuffer: Uint8Array, bootcamperId: string): Promise<string | null> {
  try {
    // Check cache first
    if (imageCache.has(bootcamperId)) {
      return imageCache.get(bootcamperId)!;
    }

    // Compress image to 64x64 WebP with quality 80
    const compressedBuffer = await sharp(Buffer.from(imageBuffer))
      .resize(64, 64, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();

    const base64 = compressedBuffer.toString('base64');
    
    // Cache the result (limit cache to 100 entries to prevent memory leak)
    if (imageCache.size >= 100) {
      // Remove the first (oldest) entry
      for (const key of imageCache.keys()) {
        imageCache.delete(key);
        break;
      }
    }
    imageCache.set(bootcamperId, base64);
    
    return base64;
  } catch (error) {
    console.error(`Error compressing image for bootcamper ${bootcamperId}:`, error);
    return null;
  }
}

/**
 * GET /api/bootcampers/ranks
 * Fetch current rank data for all bootcampers from database (updated by worker)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const { searchParams } = new URL(request.url);
    const listType = searchParams.get('listType');

    const where: Record<string, unknown> = {
      startDate: { lte: new Date() },
      OR: [
        { plannedEndDate: { gte: new Date() } },
        { actualEndDate: { gte: new Date() } },
      ],
    };

    // Apply list filtering
    if (session?.user) {
      if (listType === 'default' || !listType) {
        where.isDefault = true;
      }
      // If listType === 'user', we'll use the association table below and return early
    } else {
      where.isDefault = true;
    }

    // Optimize: Only select needed fields, exclude large images initially
    // If the user requested their personal list, prefer the association table
    if (session?.user && listType === 'user') {
      // Fetch associations and include canonical bootcamper data (including rank fields and images)
      const associations = await prisma.userBootcamper.findMany({
        where: { userId: session.user.id },
        include: {
          bootcamper: {
            select: {
              id: true,
              riotId: true,
              summonerName: true,
              name: true,
              summonerId: true,
              puuid: true,
              region: true,
              twitchLogin: true,
              twitchUserId: true,
              twitchProfileImage: true,
              role: true,
              startDate: true,
              plannedEndDate: true,
              actualEndDate: true,
              status: true,
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
              _count: {
                select: {
                  games: {
                    where: { status: 'completed' }
                  }
                }
              }
            }
          }
        }
      });

      type CanonicalBoot = {
        id: string;
        riotId?: string | null;
        summonerName: string;
        name?: string | null;
        region: string;
        twitchLogin?: string | null;
        twitchProfileImage?: Uint8Array | null;
        role?: string | null;
        status: string;
        currentSoloTier?: string | null;
        currentSoloRank?: string | null;
        currentSoloLP?: number | null;
        currentSoloWins?: number | null;
        currentSoloLosses?: number | null;
        currentFlexTier?: string | null;
        currentFlexRank?: string | null;
        currentFlexLP?: number | null;
        currentFlexWins?: number | null;
        currentFlexLosses?: number | null;
        peakSoloTier?: string | null;
        peakSoloRank?: string | null;
        peakSoloLP?: number | null;
        peakFlexTier?: string | null;
        peakFlexRank?: string | null;
        peakFlexLP?: number | null;
        _count?: { games?: number };
      };

      const ranksDataPromises = associations.map(async (assoc) => {
        const b = assoc.bootcamper as CanonicalBoot;

        // gamesPlayed: prefer count from canonical bootcamper
        const gamesPlayed = b._count?.games || 0;

        // peak rank
        let peakRank = null;
        if (b.peakSoloTier && b.peakSoloRank !== null && b.peakSoloLP !== null) {
          peakRank = {
            tier: b.peakSoloTier,
            rank: b.peakSoloRank,
            leaguePoints: b.peakSoloLP,
            wins: 0,
            losses: 0,
            winRate: 0,
          };
        } else if (b.peakFlexTier && b.peakFlexRank !== null && b.peakFlexLP !== null) {
          peakRank = {
            tier: b.peakFlexTier,
            rank: b.peakFlexRank,
            leaguePoints: b.peakFlexLP,
            wins: 0,
            losses: 0,
            winRate: 0,
          };
        }

        let compressedImage: string | null = null;
        if (b.twitchProfileImage) {
          compressedImage = await compressProfileImage(b.twitchProfileImage as unknown as Uint8Array, assoc.id);
        }

        return {
          id: assoc.id, // use association id so frontend can reference userAssociationId
          summonerName: b.summonerName,
          name: assoc.nameOverride || b.name || null,
          riotId: b.riotId,
          region: b.region,
          role: b.role,
          status: b.status,
          twitchLogin: b.twitchLogin,
          twitchProfileImage: compressedImage,
          gamesPlayed,
          soloQueue: b.currentSoloTier
            ? {
                tier: b.currentSoloTier,
                rank: b.currentSoloRank!,
                leaguePoints: b.currentSoloLP!,
                wins: b.currentSoloWins || 0,
                losses: b.currentSoloLosses || 0,
                winRate:
                  (b.currentSoloWins || 0) + (b.currentSoloLosses || 0) > 0
                    ? ((b.currentSoloWins || 0) / ((b.currentSoloWins || 0) + (b.currentSoloLosses || 0))) * 100
                    : 0,
              }
            : null,
          flexQueue: b.currentFlexTier
            ? {
                tier: b.currentFlexTier,
                rank: b.currentFlexRank!,
                leaguePoints: b.currentFlexLP!,
                wins: b.currentFlexWins || 0,
                losses: b.currentFlexLosses || 0,
                winRate:
                  (b.currentFlexWins || 0) + (b.currentFlexLosses || 0) > 0
                    ? ((b.currentFlexWins || 0) / ((b.currentFlexWins || 0) + (b.currentFlexLosses || 0))) * 100
                    : 0,
              }
            : null,
          peakRank: peakRank
            ? {
                tier: peakRank.tier,
                rank: peakRank.rank,
                leaguePoints: peakRank.leaguePoints,
                wins: peakRank.wins,
                losses: peakRank.losses,
                winRate:
                  peakRank.wins + peakRank.losses > 0
                    ? (peakRank.wins / (peakRank.wins + peakRank.losses)) * 100
                    : 0,
              }
            : null,
        };
      });

      const ranksData = await Promise.all(ranksDataPromises);
      return NextResponse.json(ranksData);
    }

    const bootcampers = await prisma.bootcamper.findMany({
      where,
      select: {
        id: true,
        riotId: true,
        summonerName: true,
        name: true,
        summonerId: true,
        puuid: true,
        region: true,
        twitchLogin: true,
        twitchUserId: true,
        twitchProfileImage: true, // We need this but will compress it
        role: true,
        startDate: true,
        plannedEndDate: true,
        actualEndDate: true,
        status: true,
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
        _count: {
          select: {
            games: {
              where: { status: 'completed' }
            }
          }
        }
      },
    });

    // Process images in parallel for better performance and get game counts for user references
    const ranksDataPromises = bootcampers.map(async (bootcamper) => {
      // For user references, get game count from linked default bootcamper
      let gamesPlayed = bootcamper._count.games;
      if (bootcamper.linkedToDefaultId && gamesPlayed === 0) {
        const defaultBootcamper = await prisma.bootcamper.findUnique({
          where: { id: bootcamper.linkedToDefaultId },
          select: {
            _count: {
              select: {
                games: {
                  where: { status: 'completed' }
                }
              }
            }
          }
        });
        gamesPlayed = defaultBootcamper?._count.games || 0;
      }

      // Get peak rank from database (stored by worker)
      let peakRank = null;
      if (bootcamper.peakSoloTier && bootcamper.peakSoloRank !== null && bootcamper.peakSoloLP !== null) {
        peakRank = {
          tier: bootcamper.peakSoloTier,
          rank: bootcamper.peakSoloRank,
          leaguePoints: bootcamper.peakSoloLP,
          wins: 0, // Not tracked historically
          losses: 0, // Not tracked historically
          winRate: 0, // Not tracked historically
        };
      } else if (bootcamper.peakFlexTier && bootcamper.peakFlexRank !== null && bootcamper.peakFlexLP !== null) {
        // Fall back to flex peak if no solo peak
        peakRank = {
          tier: bootcamper.peakFlexTier,
          rank: bootcamper.peakFlexRank,
          leaguePoints: bootcamper.peakFlexLP,
          wins: 0,
          losses: 0,
          winRate: 0,
        };
      }

      // Compress profile image if it exists
      let compressedImage: string | null = null;
      if (bootcamper.twitchProfileImage) {
        compressedImage = await compressProfileImage(bootcamper.twitchProfileImage, bootcamper.id);
      }

      return {
        id: bootcamper.id,
        summonerName: bootcamper.summonerName,
        name: bootcamper.name || null,
        riotId: bootcamper.riotId,
        region: bootcamper.region,
        role: bootcamper.role,
        status: bootcamper.status,
        twitchLogin: bootcamper.twitchLogin,
        twitchProfileImage: compressedImage,
        gamesPlayed: gamesPlayed, // Use the corrected games count
        soloQueue: bootcamper.currentSoloTier
          ? {
              tier: bootcamper.currentSoloTier,
              rank: bootcamper.currentSoloRank!,
              leaguePoints: bootcamper.currentSoloLP!,
              wins: bootcamper.currentSoloWins || 0,
              losses: bootcamper.currentSoloLosses || 0,
              winRate:
                (bootcamper.currentSoloWins || 0) + (bootcamper.currentSoloLosses || 0) > 0
                  ? ((bootcamper.currentSoloWins || 0) / ((bootcamper.currentSoloWins || 0) + (bootcamper.currentSoloLosses || 0))) * 100
                  : 0,
            }
          : null,
        flexQueue: bootcamper.currentFlexTier
          ? {
              tier: bootcamper.currentFlexTier,
              rank: bootcamper.currentFlexRank!,
              leaguePoints: bootcamper.currentFlexLP!,
              wins: bootcamper.currentFlexWins || 0,
              losses: bootcamper.currentFlexLosses || 0,
              winRate:
                (bootcamper.currentFlexWins || 0) + (bootcamper.currentFlexLosses || 0) > 0
                  ? ((bootcamper.currentFlexWins || 0) / ((bootcamper.currentFlexWins || 0) + (bootcamper.currentFlexLosses || 0))) * 100
                  : 0,
            }
          : null,
        peakRank: peakRank
          ? {
              tier: peakRank.tier,
              rank: peakRank.rank,
              leaguePoints: peakRank.leaguePoints,
              wins: peakRank.wins,
              losses: peakRank.losses,
              winRate:
                peakRank.wins + peakRank.losses > 0
                  ? (peakRank.wins / (peakRank.wins + peakRank.losses)) * 100
                  : 0,
            }
          : null,
      };
    });

    // Wait for all image processing to complete
    const ranksData = await Promise.all(ranksDataPromises);

    return NextResponse.json(ranksData);
  } catch (error) {
    console.error('Error fetching ranks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ranks' },
      { status: 500 }
    );
  }
}
