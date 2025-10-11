import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getRiotClient } from '@/lib/riot-api';
import { RiotRegion, REGION_TO_PLATFORM } from '@/lib/types';
import { auth } from '@/lib/auth';

/**
 * API endpoint to manually trigger summoner name updates for all bootcampers
 * Useful for immediate updates without waiting for the scheduled worker
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!session.user.isAdmin) {
      return NextResponse.json({ error: 'Forbidden - admin only' }, { status: 403 });
    }

    const riotClient = getRiotClient();
    
    // Get all active bootcampers with PUUID
    const bootcampers = await prisma.bootcamper.findMany({
      where: {
        puuid: { not: '' },
      },
    });

    const updates: Array<{
      id: string;
      oldName: string;
      newName: string;
      oldRiotId: string;
      newRiotId: string;
    }> = [];

    for (const bootcamper of bootcampers) {
      try {
        // Get the platform region for Account API
        const platformRegion = REGION_TO_PLATFORM[bootcamper.region as RiotRegion];
        
        // Fetch current account data using PUUID
        const accountData = await riotClient.getAccountByPuuid(platformRegion, bootcamper.puuid);
        
        // Construct the full Riot ID
        const currentRiotId = `${accountData.gameName}#${accountData.tagLine}`;
        const currentSummonerName = accountData.gameName;
        
        // Check if the name has changed
        if (currentSummonerName !== bootcamper.summonerName || currentRiotId !== bootcamper.riotId) {
          // Update the database with the new name
          await prisma.bootcamper.update({
            where: { id: bootcamper.id },
            data: {
              summonerName: currentSummonerName,
              riotId: currentRiotId,
              updatedAt: new Date(),
            },
          });
          
          updates.push({
            id: bootcamper.id,
            oldName: bootcamper.summonerName,
            newName: currentSummonerName,
            oldRiotId: bootcamper.riotId || 'N/A',
            newRiotId: currentRiotId,
          });
          
          console.log(`🔄 Name change detected!`);
          console.log(`   ${bootcamper.summonerName} (${bootcamper.riotId || 'N/A'}) → ${currentSummonerName} (${currentRiotId})`);
        }
      } catch (error) {
        console.error(`Error updating summoner name for ${bootcamper.summonerName}:`, error);
        // Continue with next bootcamper
      }
    }

    return NextResponse.json({
      success: true,
      checked: bootcampers.length,
      updated: updates.length,
      updates,
    });
  } catch (error) {
    console.error('Error updating summoner names:', error);
    return NextResponse.json(
      { error: 'Failed to update summoner names' },
      { status: 500 }
    );
  }
}
