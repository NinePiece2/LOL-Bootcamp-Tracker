import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getRiotClient } from '@/lib/riot-api';
import { RiotRegion } from '@/lib/types';
import { auth } from '@/lib/auth';
// Use a lightweight local type for bootcamper with games to avoid Prisma helper type issues
type BootcamperWithGames = {
  id: string;
  riotId: string | null;
  summonerName: string;
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
 * Fetch current rank data for all bootcampers
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

    const riotClient = getRiotClient();
    const ranksData = await Promise.all(
      bootcampers.map(async (bootcamper: BootcamperWithGames) => {
        try {
          // Skip if no PUUID (can't fetch rank without it)
          if (!bootcamper.puuid) {
            return {
              id: bootcamper.id,
              summonerName: bootcamper.summonerName,
              riotId: bootcamper.riotId,
              region: bootcamper.region,
              role: bootcamper.role,
              status: bootcamper.status,
              gamesPlayed: bootcamper.games.length,
              soloQueue: null,
              flexQueue: null,
            };
          }

          const leagueEntries = await riotClient.getLeagueEntries(
            bootcamper.region as RiotRegion,
            bootcamper.puuid
          );

          const soloQueue = leagueEntries.find(
            (entry) => entry.queueType === 'RANKED_SOLO_5x5'
          );
          const flexQueue = leagueEntries.find(
            (entry) => entry.queueType === 'RANKED_FLEX_SR'
          );

          // Determine peak rank (for now, just use current highest rank)
          // TODO: Track historical peak rank in database
          const rankOrder: Record<string, number> = {
            'CHALLENGER': 8,
            'GRANDMASTER': 7,
            'MASTER': 6,
            'DIAMOND': 5,
            'EMERALD': 4,
            'PLATINUM': 3,
            'GOLD': 2,
            'SILVER': 1,
            'BRONZE': 0,
            'IRON': -1,
          };

          let peakRank = null;
          if (soloQueue && flexQueue) {
            const soloValue = rankOrder[soloQueue.tier] || 0;
            const flexValue = rankOrder[flexQueue.tier] || 0;
            peakRank = soloValue >= flexValue ? soloQueue : flexQueue;
          } else {
            peakRank = soloQueue || flexQueue;
          }

          return {
            id: bootcamper.id,
            summonerName: bootcamper.summonerName,
            riotId: bootcamper.riotId,
            region: bootcamper.region,
            role: bootcamper.role,
            status: bootcamper.status,
            gamesPlayed: bootcamper.games.length,
            soloQueue: soloQueue
              ? {
                  tier: soloQueue.tier,
                  rank: soloQueue.rank,
                  leaguePoints: soloQueue.leaguePoints,
                  wins: soloQueue.wins,
                  losses: soloQueue.losses,
                  winRate:
                    soloQueue.wins + soloQueue.losses > 0
                      ? (soloQueue.wins / (soloQueue.wins + soloQueue.losses)) * 100
                      : 0,
                }
              : null,
            flexQueue: flexQueue
              ? {
                  tier: flexQueue.tier,
                  rank: flexQueue.rank,
                  leaguePoints: flexQueue.leaguePoints,
                  wins: flexQueue.wins,
                  losses: flexQueue.losses,
                  winRate:
                    flexQueue.wins + flexQueue.losses > 0
                      ? (flexQueue.wins / (flexQueue.wins + flexQueue.losses)) * 100
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
        } catch (error) {
          console.error(`Error fetching rank for ${bootcamper.summonerName}:`, error);
          return {
            id: bootcamper.id,
            summonerName: bootcamper.summonerName,
            riotId: bootcamper.riotId,
            region: bootcamper.region,
            role: bootcamper.role,
            status: bootcamper.status,
            gamesPlayed: bootcamper.games.length,
            soloQueue: null,
            flexQueue: null,
            peakRank: null,
          };
        }
      })
    );

    return NextResponse.json(ranksData);
  } catch (error) {
    console.error('Error fetching ranks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ranks' },
      { status: 500 }
    );
  }
}
