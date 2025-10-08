import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

// Use a lightweight local type for bootcamper with games to avoid Prisma helper type issues
type BootcamperWithGames = {
  id: string;
  riotId: string | null;
  summonerName: string;
  name: string | null;
  summonerId: string | null;
  puuid: string | null;
  region: string;
  twitchLogin: string | null;
  twitchUserId: string | null;
  role: string | null;
  startDate: string | Date;
  plannedEndDate: string | Date | null;
  actualEndDate: string | Date | null;
  status: string;
  peakSoloTier: string | null;
  peakSoloRank: string | null;
  peakSoloLP: number | null;
  peakFlexTier: string | null;
  peakFlexRank: string | null;
  peakFlexLP: number | null;
  peakUpdatedAt: Date | null;
  currentSoloTier: string | null;
  currentSoloRank: string | null;
  currentSoloLP: number | null;
  currentSoloWins: number | null;
  currentSoloLosses: number | null;
  currentFlexTier: string | null;
  currentFlexRank: string | null;
  currentFlexLP: number | null;
  currentFlexWins: number | null;
  currentFlexLosses: number | null;
  rankUpdatedAt: Date | null;
  games: Array<{
    id: string;
    riotGameId: string;
    bootcamperId: string;
    startedAt: string | Date;
    endedAt: string | Date | null;
    status: string;
  }>;
};

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
      } else if (listType === 'user') {
        where.userId = session.user.id;
        where.isDefault = false;
      }
    } else {
      where.isDefault = true;
    }

    const bootcampers = await prisma.bootcamper.findMany({
      where,
      include: {
        games: {
          where: { status: 'completed' },
          orderBy: { startedAt: 'desc' },
        },
      },
    });

    // Return rank data from database (updated by worker every 5 minutes)
    const ranksData = bootcampers.map((bootcamper: BootcamperWithGames) => {
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

      return {
        id: bootcamper.id,
        summonerName: bootcamper.summonerName,
        name: bootcamper.name || null,
        riotId: bootcamper.riotId,
        region: bootcamper.region,
        role: bootcamper.role,
        status: bootcamper.status,
        gamesPlayed: bootcamper.games.length,
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

    return NextResponse.json(ranksData);
  } catch (error) {
    console.error('Error fetching ranks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ranks' },
      { status: 500 }
    );
  }
}
