import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

interface Participant {
  summonerName?: string;
  riotIdGameName?: string;
  riotIdTagline?: string;
  puuid?: string;
  championId?: number;
  rank?: string;
  tier?: string;
  division?: string;
  leaguePoints?: number;
  spell1Id?: number;
  spell2Id?: number;
  teamId?: number;
}

interface MatchData {
  participants?: Participant[];
}

interface GameWithMatchData {
  bootcamper: { summonerName: string };
  riotGameId: string;
  matchData?: MatchData;
}

/**
 * Debug endpoint to check what's actually in the database
 */
export async function GET() {
  try {
    const games = await prisma.game.findMany({
      where: {
        status: 'live',
      },
      include: {
        bootcamper: {
          select: {
            summonerName: true,
          },
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
      take: 5,
    });

    const debugData = (games as unknown as GameWithMatchData[]).map((game) => {
      const matchData = game.matchData as MatchData | undefined;
      const participant = matchData?.participants?.[0];
      
      return {
        bootcamper: game.bootcamper.summonerName,
        gameId: game.riotGameId,
        hasMatchData: !!game.matchData,
        participantCount: matchData?.participants?.length || 0,
        sampleParticipant: participant ? {
          allFields: Object.keys(participant),
          summonerName: participant.summonerName,
          riotIdGameName: participant.riotIdGameName,
          riotIdTagline: participant.riotIdTagline,
          puuid: participant.puuid?.substring(0, 8) + '...',
          championId: participant.championId,
          rank: participant.rank,
          tier: participant.tier,
          division: participant.division,
          leaguePoints: participant.leaguePoints,
          spell1Id: participant.spell1Id,
          spell2Id: participant.spell2Id,
          teamId: participant.teamId,
        } : null,
      };
    });

    return NextResponse.json({
      message: 'Live games debug data',
      count: games.length,
      games: debugData,
    });
  } catch (error) {
    console.error('Error fetching debug data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch debug data', details: String(error) },
      { status: 500 }
    );
  }
}
