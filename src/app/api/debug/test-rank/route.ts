import { NextRequest, NextResponse } from 'next/server';
import { getRiotClient } from '@/lib/riot-api';
import { RiotRegion, LeagueEntryDTO } from '@/lib/types';
import { AxiosError } from 'axios';

/**
 * Test endpoint to verify rank fetching works
 * Usage: /api/debug/test-rank?puuid=xxx&region=kr
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const puuid = searchParams.get('puuid');
    const region = (searchParams.get('region') || 'kr') as RiotRegion;

    if (!puuid) {
      return NextResponse.json(
        { error: 'puuid parameter is required' },
        { status: 400 }
      );
    }

    const riotClient = getRiotClient();
    
    console.log(`Testing rank fetch for puuid: ${puuid.substring(0, 8)}... in region: ${region}`);
    
    const rankData = await riotClient.getLeagueEntries(region, puuid);
    
    console.log('Rank data received:', rankData);
    
    const soloQueueRank = rankData.find((entry: LeagueEntryDTO) => entry.queueType === 'RANKED_SOLO_5x5');
    
    return NextResponse.json({
      puuid: puuid.substring(0, 8) + '...',
      region,
      allRanks: rankData,
      soloQueue: soloQueueRank || null,
      formatted: soloQueueRank ? {
        rank: `${soloQueueRank.tier} ${soloQueueRank.rank}`,
        tier: soloQueueRank.tier,
        division: soloQueueRank.rank,
        leaguePoints: soloQueueRank.leaguePoints,
        wins: soloQueueRank.wins,
        losses: soloQueueRank.losses,
      } : null,
    });
  } catch (error) {
    console.error('Error testing rank fetch:', error);
    const axiosError = error as AxiosError;
    return NextResponse.json(
      { 
        error: 'Failed to fetch rank data',
        details: error instanceof Error ? error.message : 'Unknown error',
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
      },
      { status: 500 }
    );
  }
}
