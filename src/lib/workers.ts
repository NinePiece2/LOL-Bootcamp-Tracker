import { Queue, Worker, Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { getRiotClient } from '@/lib/riot-api';
import { getTwitchClient } from '@/lib/twitch-api';
import { RiotRegion, REGION_TO_PLATFORM } from '@/lib/types';
import { updateChampionPlayrates } from '@/lib/playrate-fetcher';
import { identifyRoles } from '@/lib/role-identification';

// Global queue and worker variables - initialized in initializeWorkers()
let spectatorQueue: Queue;
let matchDataQueue: Queue;
let twitchStreamQueue: Queue;
let summonerNameQueue: Queue;
let rankQueue: Queue;
let playrateQueue: Queue;
let spectatorWorker: Worker;
let matchDataWorker: Worker;
let twitchStreamWorker: Worker;
let summonerNameWorker: Worker;
let rankWorker: Worker;
let playrateWorker: Worker;

interface SpectatorJobData {
  bootcamperId: string;
  puuid: string;
  region: RiotRegion;
}

interface MatchDataJobData {
  bootcamperId: string;
  gameId: string;
  region: RiotRegion;
}

interface SummonerNameJobData {
  bootcamperId: string;
  puuid: string;
  region: RiotRegion;
}

interface TwitchStreamJobData {
  bootcamperId: string;
  twitchUserId: string;
  twitchLogin: string;
}

interface RankJobData {
  bootcamperId: string;
  puuid: string;
  region: RiotRegion;
}

/**
 * Poll spectator API for a bootcamper
 */
async function checkSpectator(data: SpectatorJobData) {
  const { bootcamperId, puuid, region } = data;
  
  // Skip if PUUID is missing (old jobs before migration)
  if (!puuid) {
    console.warn(`Skipping spectator check for bootcamper ${bootcamperId}: PUUID missing`);
    return;
  }
  
  const riotClient = getRiotClient();
  const bootcamper = await prisma.bootcamper.findUnique({
    where: { id: bootcamperId },
  });

  if (!bootcamper) {
    console.warn(`Bootcamper ${bootcamperId} not found, skipping spectator check`);
    return;
  }

  try {
    const activeGame = await riotClient.getActiveGame(region, puuid);

    if (activeGame) {
      // Summoner is in game
      // Check if this is a new game (different game ID or status changed)
      const isNewGame = bootcamper.status !== 'in_game' || bootcamper.lastGameId !== activeGame.gameId.toString();
      
      if (isNewGame) {
        console.log(`🎮 New game detected for ${bootcamper.summonerName} (ID: ${activeGame.gameId})`);
        console.log(`📋 Sample participant fields:`, Object.keys(activeGame.participants[0]));
        console.log(`📋 Sample participant data:`, {
          puuid: activeGame.participants[0].puuid?.substring(0, 8) + '...',
          summonerName: activeGame.participants[0].summonerName,
          riotId: activeGame.participants[0].riotId,
          riotIdGameName: activeGame.participants[0].riotIdGameName,
          championId: activeGame.participants[0].championId,
          teamId: activeGame.participants[0].teamId,
          spell1Id: activeGame.participants[0].spell1Id,
          spell2Id: activeGame.participants[0].spell2Id,
        });
      
        // Enrich participants with rank data ONLY for new games
        console.log(`📊 Enriching ${activeGame.participants.length} participants with rank data...`);
        const enrichedParticipants = await Promise.all(
          activeGame.participants.map(async (participant) => {
            try {
              const playerName = participant.summonerName || participant.riotIdGameName || 'Unknown';
              console.log(`Fetching rank for ${playerName} (puuid: ${participant.puuid?.substring(0, 8)}...)...`);
              
              // Fetch rank data for each participant by their puuid (v5 API)
              const rankData = await riotClient.getLeagueEntries(region, participant.puuid);
              console.log(`Rank data received for ${playerName}:`, rankData);
              
              // Find solo queue rank
              const soloQueueRank = rankData.find((entry: { queueType: string }) => entry.queueType === 'RANKED_SOLO_5x5');
              
              const enriched = {
                ...participant,
                rank: soloQueueRank ? `${soloQueueRank.tier} ${soloQueueRank.rank}` : 'Unranked',
                tier: soloQueueRank?.tier || null,
                division: soloQueueRank?.rank || null,
                leaguePoints: soloQueueRank?.leaguePoints || 0,
              };
              
              console.log(`✅ Enriched participant ${playerName}:`, {
                rank: enriched.rank,
                tier: enriched.tier,
                division: enriched.division,
                LP: enriched.leaguePoints,
                hadData: !!soloQueueRank,
              });
              
              return enriched;
            } catch (error) {
              const playerName = participant.summonerName || participant.riotIdGameName || 'Unknown';
              console.error(`❌ Failed to fetch rank for ${playerName}:`, {
                error: error instanceof Error ? error.message : String(error),
                puuid: participant.puuid?.substring(0, 8) + '...',
              });
              return {
                ...participant,
                rank: 'Unranked',
                tier: null,
                division: null,
                leaguePoints: 0,
              };
            }
          })
        );
        
        console.log(`📊 Enrichment complete. Sample result:`, {
          name: enrichedParticipants[0]?.summonerName,
          rank: enrichedParticipants[0]?.rank,
          tier: enrichedParticipants[0]?.tier,
        });

        // Identify roles for all participants
        console.log(`🎯 Identifying roles for ${enrichedParticipants.length} participants...`);
        const roleAssignments = await identifyRoles(enrichedParticipants);
        
        // Add inferred roles to participants
        const participantsWithRoles = enrichedParticipants.map(p => {
          const role = roleAssignments.get(p.puuid) || 'MIDDLE';
          return {
            ...p,
            inferredRole: role,
          };
        });

        const enrichedMatchData = {
          ...activeGame,
          participants: participantsWithRoles,
        };

        // Upsert the game record with enriched data for NEW games
        await prisma.$transaction([
          // Update bootcamper status
          prisma.bootcamper.update({
            where: { id: bootcamperId },
            data: {
              status: 'in_game',
              lastGameId: activeGame.gameId.toString(),
            },
          }),
          // Create or update game record, storing enriched lobby data in matchData
          prisma.game.upsert({
            where: {
              riotGameId_bootcamperId: {
                riotGameId: activeGame.gameId.toString(),
                bootcamperId,
              },
            },
            create: {
              riotGameId: activeGame.gameId.toString(),
              bootcamperId,
              startedAt: new Date(activeGame.gameStartTime),
              status: 'in_progress',
              // @ts-expect-error - Prisma JSON type differences between local and Docker
              matchData: enrichedMatchData, // Store enriched lobby info
            },
            update: {
              status: 'in_progress',
              // @ts-expect-error - Prisma JSON type differences between local and Docker
              matchData: enrichedMatchData, // Update enriched lobby info only for new games
            },
          }),
        ]);

        // TODO: Emit WebSocket event for game started
      } else {
        // Game is ongoing but not new - just update bootcamper status if needed
        // Skip rank enrichment for existing games to save API calls
        console.log(`♻️ Game ${activeGame.gameId} already tracked for ${bootcamper.summonerName}, skipping rank fetch`);
        
        if (bootcamper.status !== 'in_game') {
          await prisma.bootcamper.update({
            where: { id: bootcamperId },
            data: {
              status: 'in_game',
              lastGameId: activeGame.gameId.toString(),
            },
          });
        }
      }
    } else {
      // Summoner not in game
      if (bootcamper.status === 'in_game' && bootcamper.lastGameId) {
        // Game just ended
        console.log(`🏁 Game ended for ${bootcamper.summonerName} (ID: ${bootcamper.lastGameId})`);
        
        await prisma.$transaction([
          // Update bootcamper status
          prisma.bootcamper.update({
            where: { id: bootcamperId },
            data: { status: 'idle' },
          }),
          // Update game record
          prisma.game.updateMany({
            where: {
              riotGameId: bootcamper.lastGameId,
              bootcamperId,
              status: { in: ['live', 'in_progress'] }, // Handle both old and new status values
            },
            data: {
              status: 'completed',
              endedAt: new Date(),
            },
          }),
        ]);

        // Schedule match data fetch (with delay to allow Riot API to process)
        await matchDataQueue.add(
          'fetch-match-data',
          {
            bootcamperId,
            gameId: bootcamper.lastGameId,
            region,
          },
          { delay: 60000 } // Wait 60 seconds before fetching match data
        );

        // Schedule peak rank check after game ends (with delay to allow rank to update)
        await rankQueue.add(
          'check-rank-after-game',
          {
            bootcamperId,
            puuid,
            region,
          },
          { delay: 90000 } // Wait 90 seconds to allow Riot API to update rank
        );

        // Also update current rank after game ends
        await rankQueue.add(
          'update-current-rank',
          {
            bootcamperId,
            puuid,
            region,
          },
          { delay: 95000 } // Wait 95 seconds (slightly after peak rank check)
        );

        // TODO: Emit WebSocket event for game ended
      }
    }
  } catch (error) {
    // Only log errors that aren't expected 404s (when player is not in game)
    if (!(error instanceof Error && error.message.includes('404'))) {
      console.error(`❌ Error checking spectator for ${bootcamper.summonerName}:`, error);
    }
    // Don't throw error for 404s to prevent worker failure
    if (error instanceof Error && error.message.includes('404')) {
      return; // Silently handle - player just not in game
    }
    throw error;
  }
}

/**
 * Fetch match data from Riot API
 */
async function fetchMatchData(data: MatchDataJobData) {
  const { bootcamperId, gameId, region } = data;
  
  const riotClient = getRiotClient();
  const bootcamper = await prisma.bootcamper.findUnique({
    where: { id: bootcamperId },
  });

  if (!bootcamper) {
    console.warn(`Bootcamper ${bootcamperId} not found, skipping match data fetch`);
    return;
  }

  try {
    // Construct match ID (format: REGION_GAMEID)
    const matchId = `${region.toUpperCase()}_${gameId}`;
    const matchData = await riotClient.getMatchById(region, matchId);

    // Update game record with match data
    await prisma.game.updateMany({
      where: {
        riotGameId: gameId,
        bootcamperId,
      },
      data: {
        // @ts-expect-error - Prisma JSON type differences between local and Docker
        matchData: matchData,
      },
    });

    console.log(`Match data fetched for game ${gameId}`);
  } catch (error) {
    console.error(`Error fetching match data for game ${gameId}:`, error);
    throw error;
  }
}

/**
 * Check and update summoner name if it has changed
 */
async function updateSummonerName(data: SummonerNameJobData) {
  const { bootcamperId, puuid, region } = data;
  
  const riotClient = getRiotClient();
  const bootcamper = await prisma.bootcamper.findUnique({
    where: { id: bootcamperId },
  });

  if (!bootcamper) {
    console.warn(`Bootcamper ${bootcamperId} not found, skipping name update check`);
    return;
  }

  try {
    // Get the platform region for Account API
    const platformRegion = REGION_TO_PLATFORM[region];
    
    // Fetch current account data using PUUID to get current gameName#tagLine
    const accountData = await riotClient.getAccountByPuuid(platformRegion, puuid);
    
    // Construct the full Riot ID
    const currentRiotId = `${accountData.gameName}#${accountData.tagLine}`;
    const currentSummonerName = accountData.gameName;
    
    // Check if the name has changed
    if (currentSummonerName !== bootcamper.summonerName || currentRiotId !== bootcamper.riotId) {
      const oldName = bootcamper.summonerName;
      const oldRiotId = bootcamper.riotId || 'N/A';
      
      // Update the database with the new name
      await prisma.bootcamper.update({
        where: { id: bootcamperId },
        data: {
          summonerName: currentSummonerName,
          riotId: currentRiotId,
          updatedAt: new Date(),
        },
      });
      
      console.log(`🔄 Name change detected!`);
      console.log(`   ${oldName} (${oldRiotId}) → ${currentSummonerName} (${currentRiotId})`);
    }
  } catch (error) {
    console.error(`Error updating summoner name for ${bootcamper.summonerName}:`, error);
    // Don't throw - we don't want to fail the job for this
  }
}

/**
 * Check if bootcamper is live on Twitch
 */
async function checkTwitchStream(data: TwitchStreamJobData) {
  const { bootcamperId, twitchUserId, twitchLogin } = data;
  
  const twitchClient = getTwitchClient();
  const bootcamper = await prisma.bootcamper.findUnique({
    where: { id: bootcamperId },
  });

  if (!bootcamper) {
    console.warn(`Bootcamper ${bootcamperId} not found, skipping Twitch check`);
    return;
  }

  try {
    // Check if user is streaming
    const streams = await twitchClient.getStreams([twitchUserId]);
    const isLive = streams.length > 0;

    if (isLive) {
      const stream = streams[0];
      
      // Find existing stream record
      const existingStream = await prisma.twitchStream.findFirst({
        where: { bootcamperId },
        orderBy: { startedAt: 'desc' },
      });

      if (existingStream) {
        // Update existing stream
        await prisma.twitchStream.update({
          where: { id: existingStream.id },
          data: {
            live: true,
            startedAt: new Date(stream.started_at),
            endedAt: null,
            twitchUserId,
            streamUrl: `https://www.twitch.tv/${twitchLogin}`,
          },
        });
      } else {
        // Create new stream record
        await prisma.twitchStream.create({
          data: {
            bootcamperId,
            twitchUserId,
            streamUrl: `https://www.twitch.tv/${twitchLogin}`,
            live: true,
            startedAt: new Date(stream.started_at),
          },
        });
      }

      console.log(`✅ ${bootcamper.summonerName} is LIVE on Twitch`);
    } else {
      // Check if there's an active stream to mark as ended
      const activeStream = await prisma.twitchStream.findFirst({
        where: {
          bootcamperId,
          live: true,
        },
      });

      if (activeStream) {
        await prisma.twitchStream.update({
          where: { id: activeStream.id },
          data: {
            live: false,
            endedAt: new Date(),
          },
        });
        console.log(`📴 ${bootcamper.summonerName} went offline on Twitch`);
      }
    }
  } catch (error) {
    console.error(`Error checking Twitch stream for ${bootcamper.summonerName}:`, error);
    throw error;
  }
}

/**
 * Check current rank and update peak rank if higher
 */
async function checkAndUpdatePeakRank(data: RankJobData) {
  const { bootcamperId, puuid, region } = data;
  
  if (!puuid) {
    console.warn(`Skipping rank check for bootcamper ${bootcamperId}: PUUID missing`);
    return;
  }
  
  const riotClient = getRiotClient();
  const bootcamper = await prisma.bootcamper.findUnique({
    where: { id: bootcamperId },
  });

  if (!bootcamper) {
    console.warn(`Bootcamper ${bootcamperId} not found, skipping rank check`);
    return;
  }

  try {
    const leagueEntries = await riotClient.getLeagueEntries(region, puuid);
    
    const soloQueue = leagueEntries.find(
      (entry) => entry.queueType === 'RANKED_SOLO_5x5'
    );
    const flexQueue = leagueEntries.find(
      (entry) => entry.queueType === 'RANKED_FLEX_SR'
    );

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

    const divisionOrder: Record<string, number> = {
      'I': 4,
      'II': 3,
      'III': 2,
      'IV': 1,
    };

    // Helper function to calculate total LP score for ranking comparison
    const calculateScore = (tier: string, rank: string, lp: number) => {
      const tierValue = rankOrder[tier] || 0;
      const divisionValue = divisionOrder[rank] || 0;
      // Master+ tiers don't have divisions
      if (tierValue >= 6) {
        return tierValue * 1000 + lp;
      }
      return tierValue * 1000 + divisionValue * 100 + lp;
    };

    const updates: Record<string, unknown> = {
      peakUpdatedAt: new Date(),
    };

    let updated = false;

    // Check and update Solo Queue peak
    if (soloQueue) {
      const currentScore = calculateScore(
        soloQueue.tier,
        soloQueue.rank,
        soloQueue.leaguePoints
      );
      
      let peakScore = -1;
      if (bootcamper.peakSoloTier && bootcamper.peakSoloRank !== null && bootcamper.peakSoloLP !== null) {
        peakScore = calculateScore(
          bootcamper.peakSoloTier,
          bootcamper.peakSoloRank,
          bootcamper.peakSoloLP
        );
      }

      if (currentScore > peakScore) {
        updates.peakSoloTier = soloQueue.tier;
        updates.peakSoloRank = soloQueue.rank;
        updates.peakSoloLP = soloQueue.leaguePoints;
        updated = true;
        console.log(`📈 New Solo Queue peak for ${bootcamper.summonerName}: ${soloQueue.tier} ${soloQueue.rank} ${soloQueue.leaguePoints}LP`);
      }
    }

    // Check and update Flex Queue peak
    if (flexQueue) {
      const currentScore = calculateScore(
        flexQueue.tier,
        flexQueue.rank,
        flexQueue.leaguePoints
      );
      
      let peakScore = -1;
      if (bootcamper.peakFlexTier && bootcamper.peakFlexRank !== null && bootcamper.peakFlexLP !== null) {
        peakScore = calculateScore(
          bootcamper.peakFlexTier,
          bootcamper.peakFlexRank,
          bootcamper.peakFlexLP
        );
      }

      if (currentScore > peakScore) {
        updates.peakFlexTier = flexQueue.tier;
        updates.peakFlexRank = flexQueue.rank;
        updates.peakFlexLP = flexQueue.leaguePoints;
        updated = true;
        console.log(`📈 New Flex Queue peak for ${bootcamper.summonerName}: ${flexQueue.tier} ${flexQueue.rank} ${flexQueue.leaguePoints}LP`);
      }
    }

    // Update database if there were any changes
    if (updated || !bootcamper.peakUpdatedAt) {
      await prisma.bootcamper.update({
        where: { id: bootcamperId },
        data: updates,
      });
    }
  } catch (error) {
    // Better error handling with context
    if (error instanceof Error) {
      if (error.message.includes('404')) {
        // Player is unranked - don't log as error
        console.log(`ℹ️  ${bootcamper.summonerName} is unranked (404 from Riot API)`);
      } else if (error.message.includes('429')) {
        console.warn(`⏳ Rate limited while checking peak rank for ${bootcamper.summonerName}, will retry later`);
      } else if (error.message.includes('500') || error.message.includes('503')) {
        console.warn(`⚠️  Riot API error (${error.message.match(/\d{3}/)?.[0]}) while checking peak rank for ${bootcamper.summonerName}, will retry later`);
      } else {
        console.error(`❌ Error checking peak rank for ${bootcamper.summonerName}:`, {
          error: error.message,
          bootcamperId,
          region,
        });
      }
    } else {
      console.error(`❌ Unknown error checking peak rank for ${bootcamper.summonerName}:`, error);
    }
    // Don't throw - allow worker to continue processing other jobs
  }
}

/**
 * Update current rank data for a bootcamper (called by periodic worker)
 */
async function updateCurrentRank(data: RankJobData) {
  const { bootcamperId, puuid, region } = data;

  const bootcamper = await prisma.bootcamper.findUnique({
    where: { id: bootcamperId },
  });

  if (!bootcamper) {
    console.warn(`Bootcamper ${bootcamperId} not found`);
    return;
  }

  try {
    const riotClient = getRiotClient();
    const leagueEntries = await riotClient.getLeagueEntries(region, puuid);

    const soloQueue = leagueEntries.find((entry: { queueType: string }) => entry.queueType === 'RANKED_SOLO_5x5');
    const flexQueue = leagueEntries.find((entry: { queueType: string }) => entry.queueType === 'RANKED_FLEX_SR');

    // Prepare update object
    const updates: {
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
      rankUpdatedAt: Date;
    } = {
      rankUpdatedAt: new Date(),
    };

    // Update Solo Queue data
    if (soloQueue) {
      updates.currentSoloTier = soloQueue.tier;
      updates.currentSoloRank = soloQueue.rank;
      updates.currentSoloLP = soloQueue.leaguePoints;
      updates.currentSoloWins = soloQueue.wins;
      updates.currentSoloLosses = soloQueue.losses;
    } else {
      // Only clear rank if player was previously unranked or this is initial fetch
      // Don't overwrite existing rank data with null on API failures
      if (!bootcamper.currentSoloTier || !bootcamper.rankUpdatedAt) {
        updates.currentSoloTier = null;
        updates.currentSoloRank = null;
        updates.currentSoloLP = null;
        updates.currentSoloWins = null;
        updates.currentSoloLosses = null;
      } else {
        // Player had rank before but now unranked - only update if this is confirmed unranked (not API error)
        console.log(`ℹ️  ${bootcamper.summonerName} appears unranked in Solo Queue (was ${bootcamper.currentSoloTier} ${bootcamper.currentSoloRank})`);
      }
    }

    // Update Flex Queue data
    if (flexQueue) {
      updates.currentFlexTier = flexQueue.tier;
      updates.currentFlexRank = flexQueue.rank;
      updates.currentFlexLP = flexQueue.leaguePoints;
      updates.currentFlexWins = flexQueue.wins;
      updates.currentFlexLosses = flexQueue.losses;
    } else {
      // Only clear rank if player was previously unranked or this is initial fetch
      if (!bootcamper.currentFlexTier || !bootcamper.rankUpdatedAt) {
        updates.currentFlexTier = null;
        updates.currentFlexRank = null;
        updates.currentFlexLP = null;
        updates.currentFlexWins = null;
        updates.currentFlexLosses = null;
      } else {
        console.log(`ℹ️  ${bootcamper.summonerName} appears unranked in Flex Queue (was ${bootcamper.currentFlexTier} ${bootcamper.currentFlexRank})`);
      }
    }

    // Update database
    await prisma.bootcamper.update({
      where: { id: bootcamperId },
      data: updates,
    });

    console.log(`✅ Updated current rank for: ${bootcamper.summonerName}`);
  } catch (error) {
    // Better error handling - don't overwrite existing rank data on API errors
    if (error instanceof Error) {
      if (error.message.includes('404')) {
        // Player is unranked - only update to null if they were previously unranked
        if (!bootcamper.currentSoloTier && !bootcamper.currentFlexTier) {
          console.log(`ℹ️  ${bootcamper.summonerName} confirmed unranked (404 from Riot API)`);
          await prisma.bootcamper.update({
            where: { id: bootcamperId },
            data: {
              currentSoloTier: null,
              currentSoloRank: null,
              currentSoloLP: null,
              currentSoloWins: null,
              currentSoloLosses: null,
              currentFlexTier: null,
              currentFlexRank: null,
              currentFlexLP: null,
              currentFlexWins: null,
              currentFlexLosses: null,
              rankUpdatedAt: new Date(),
            },
          });
        } else {
          console.log(`ℹ️  ${bootcamper.summonerName} returned 404 but has existing rank data - keeping existing data`);
        }
      } else if (error.message.includes('429')) {
        console.warn(`⏳ Rate limited while updating current rank for ${bootcamper.summonerName}, will retry later`);
      } else if (error.message.includes('500') || error.message.includes('503')) {
        console.warn(`⚠️  Riot API error (${error.message.match(/\d{3}/)?.[0]}) while updating current rank for ${bootcamper.summonerName}, keeping existing data`);
      } else {
        console.error(`❌ Error updating current rank for ${bootcamper.summonerName}:`, {
          error: error.message,
          bootcamperId,
          region,
          hadPreviousRank: !!(bootcamper.currentSoloTier || bootcamper.currentFlexTier),
        });
      }
    } else {
      console.error(`❌ Unknown error updating current rank for ${bootcamper.summonerName}:`, error);
    }
    // Don't throw - allow worker to continue processing other jobs
  }
}

/**
 * Queue a rank update for a bootcamper (called when bootcamper is added)
 * Exported for use in API routes
 */
export async function queueRankUpdate(bootcamperId: string, puuid: string, region: RiotRegion) {
  if (!rankQueue) {
    console.warn('Workers not initialized. Cannot queue rank update.');
    return;
  }

  await rankQueue.add(
    'update-current-rank',
    {
      bootcamperId,
      puuid,
      region,
    },
    { delay: 2000 } // Wait 2 seconds before fetching rank
  );
  
  console.log(`📊 Queued rank update for bootcamper ${bootcamperId}`);
}

/**
 * Schedule spectator checks for all active bootcampers
 */
export async function scheduleSpectatorChecks() {
  if (!spectatorQueue) {
    throw new Error('Workers not initialized. Call initializeWorkers() first.');
  }

  const bootcampers = await prisma.bootcamper.findMany({
    where: {
      // Only check bootcampers currently in bootcamp
      startDate: { lte: new Date() },
      OR: [
        { plannedEndDate: { gte: new Date() } },
        { actualEndDate: { gte: new Date() } },
      ],
    },
  });

  console.log(`Scheduling spectator checks for ${bootcampers.length} bootcampers`);

  for (const bootcamper of bootcampers) {
    await spectatorQueue.add(
      `check-${bootcamper.id}`,
      {
        bootcamperId: bootcamper.id,
        puuid: bootcamper.puuid,
        region: bootcamper.region as RiotRegion,
      },
      {
        repeat: {
          every: 60000, // Check every 60 seconds (increased from 30s)
        },
        jobId: `spectator-${bootcamper.id}`, // Unique job ID to avoid duplicates
      }
    );
  }
}

/**
 * Schedule Twitch stream checks for bootcampers with Twitch accounts
 */
export async function scheduleTwitchStreamChecks() {
  if (!twitchStreamQueue) {
    throw new Error('Workers not initialized. Call initializeWorkers() first.');
  }

  const bootcampers = await prisma.bootcamper.findMany({
    where: {
      // Only check bootcampers with Twitch accounts
      twitchUserId: { not: null },
      twitchLogin: { not: null },
      // Currently in bootcamp
      startDate: { lte: new Date() },
      OR: [
        { plannedEndDate: { gte: new Date() } },
        { actualEndDate: { gte: new Date() } },
      ],
    },
  });

  console.log(`Scheduling Twitch stream checks for ${bootcampers.length} bootcampers`);

  for (const bootcamper of bootcampers) {
    if (bootcamper.twitchUserId && bootcamper.twitchLogin) {
      await twitchStreamQueue.add(
        `check-${bootcamper.id}`,
        {
          bootcamperId: bootcamper.id,
          twitchUserId: bootcamper.twitchUserId,
          twitchLogin: bootcamper.twitchLogin,
        },
        {
          repeat: {
            every: 60000, // Check every 60 seconds
          },
          jobId: `twitch-stream-${bootcamper.id}`, // Unique job ID to avoid duplicates
        }
      );
    }
  }
}

/**
 * Schedule summoner name checks for all bootcampers
 */
export async function scheduleSummonerNameChecks() {
  if (!summonerNameQueue) {
    throw new Error('Workers not initialized. Call initializeWorkers() first.');
  }

  const bootcampers = await prisma.bootcamper.findMany({
    where: {
      // Check all bootcampers with PUUID
      puuid: { not: '' },
      startDate: { lte: new Date() },
      OR: [
        { plannedEndDate: { gte: new Date() } },
        { actualEndDate: { gte: new Date() } },
      ],
    },
  });

  console.log(`Scheduling summoner name checks for ${bootcampers.length} bootcampers`);

  for (const bootcamper of bootcampers) {
    await summonerNameQueue.add(
      `check-${bootcamper.id}`,
      {
        bootcamperId: bootcamper.id,
        puuid: bootcamper.puuid,
        region: bootcamper.region as RiotRegion,
      },
      {
        repeat: {
          every: 3600000, // Check every hour
        },
        jobId: `summoner-name-${bootcamper.id}`, // Unique job ID to avoid duplicates
      }
    );
  }
}

/**
 * Schedule periodic rank checks for all bootcampers (every 5 minutes)
 */
export async function schedulePeriodicRankChecks() {
  if (!rankQueue) {
    throw new Error('Workers not initialized. Call initializeWorkers() first.');
  }

  const bootcampers = await prisma.bootcamper.findMany({
    where: {
      // Check all bootcampers with PUUID
      puuid: { not: '' },
      startDate: { lte: new Date() },
      OR: [
        { plannedEndDate: { gte: new Date() } },
        { actualEndDate: { gte: new Date() } },
      ],
    },
  });

  console.log(`Scheduling periodic rank checks for ${bootcampers.length} bootcampers`);

  for (const bootcamper of bootcampers) {
    // Schedule current rank update
    await rankQueue.add(
      'update-current-rank',
      {
        bootcamperId: bootcamper.id,
        puuid: bootcamper.puuid,
        region: bootcamper.region as RiotRegion,
      },
      {
        repeat: {
          every: 300000, // Check every 5 minutes
        },
        jobId: `periodic-current-rank-${bootcamper.id}`, // Unique job ID to avoid duplicates
      }
    );

    // Schedule peak rank check
    await rankQueue.add(
      'check-rank-after-game',
      {
        bootcamperId: bootcamper.id,
        puuid: bootcamper.puuid,
        region: bootcamper.region as RiotRegion,
      },
      {
        repeat: {
          every: 300000, // Check every 5 minutes
        },
        jobId: `periodic-peak-rank-${bootcamper.id}`, // Unique job ID to avoid duplicates
      }
    );
  }
}

/**
 * Sync bootcampers with periodic jobs
 * Adds any bootcampers that don't have jobs scheduled yet
 * Removes jobs for bootcampers that no longer exist
 * This runs periodically to catch bootcampers added/deleted via API routes
 */
async function syncBootcampersWithJobs() {
  if (!spectatorQueue || !summonerNameQueue || !rankQueue || !twitchStreamQueue) {
    console.warn('Queues not initialized. Skipping bootcamper sync.');
    return;
  }

  try {
    // Get all active bootcampers
    const bootcampers = await prisma.bootcamper.findMany({
      where: {
        startDate: { lte: new Date() },
        OR: [
          { plannedEndDate: { gte: new Date() } },
          { actualEndDate: { gte: new Date() } },
        ],
      },
    });

    console.log(`🔄 Syncing ${bootcampers.length} active bootcampers with jobs...`);
    let addedCount = 0;
    let removedCount = 0;

    const bootcamperIds = new Set(bootcampers.map(b => b.id));

    // Check for orphaned jobs (bootcampers that were deleted)
    const allSpectatorJobs = await spectatorQueue.getRepeatableJobs();
    for (const job of allSpectatorJobs) {
      const bootcamperId = job.id?.replace('spectator-', '');
      if (bootcamperId && !bootcamperIds.has(bootcamperId)) {
        console.log(`  🗑️  Removing orphaned jobs for deleted bootcamper ${bootcamperId}`);
        
        // Remove all job types for this bootcamper
        await spectatorQueue.removeRepeatableByKey(job.key);
        
        const nameJob = await summonerNameQueue.getRepeatableJobs();
        const nameJobToRemove = nameJob.find(j => j.id === `summoner-name-${bootcamperId}`);
        if (nameJobToRemove) await summonerNameQueue.removeRepeatableByKey(nameJobToRemove.key);
        
        const rankJobs = await rankQueue.getRepeatableJobs();
        const currentRankJob = rankJobs.find(j => j.id === `periodic-current-rank-${bootcamperId}`);
        const peakRankJob = rankJobs.find(j => j.id === `periodic-peak-rank-${bootcamperId}`);
        if (currentRankJob) await rankQueue.removeRepeatableByKey(currentRankJob.key);
        if (peakRankJob) await rankQueue.removeRepeatableByKey(peakRankJob.key);
        
        const twitchJobs = await twitchStreamQueue.getRepeatableJobs();
        const twitchJob = twitchJobs.find(j => j.id === `twitch-stream-${bootcamperId}`);
        if (twitchJob) await twitchStreamQueue.removeRepeatableByKey(twitchJob.key);
        
        removedCount++;
      }
    }

    // Get all repeatable jobs once to avoid repeated calls
    const spectatorRepeatableJobs = await spectatorQueue.getRepeatableJobs();
    const nameRepeatableJobs = await summonerNameQueue.getRepeatableJobs();
    const rankRepeatableJobs = await rankQueue.getRepeatableJobs();
    const twitchRepeatableJobs = await twitchStreamQueue.getRepeatableJobs();

    // Add missing jobs for active bootcampers
    for (const bootcamper of bootcampers) {
      if (!bootcamper.puuid) continue;

      // Check which jobs exist for this bootcamper
      const hasSpectatorJob = spectatorRepeatableJobs.some(j => j.id === `spectator-${bootcamper.id}`);
      const hasNameJob = nameRepeatableJobs.some(j => j.id === `summoner-name-${bootcamper.id}`);
      const hasCurrentRankJob = rankRepeatableJobs.some(j => j.id === `periodic-current-rank-${bootcamper.id}`);
      const hasPeakRankJob = rankRepeatableJobs.some(j => j.id === `periodic-peak-rank-${bootcamper.id}`);
      const hasTwitchJob = twitchRepeatableJobs.some(j => j.id === `twitch-stream-${bootcamper.id}`);
      
      const missingJobs: string[] = [];
      
      // Add spectator check if missing
      if (!hasSpectatorJob) {
        missingJobs.push('spectator');
        await spectatorQueue.add(
          `check-${bootcamper.id}`,
          {
            bootcamperId: bootcamper.id,
            puuid: bootcamper.puuid,
            region: bootcamper.region as RiotRegion,
          },
          {
            repeat: { every: 60000 },
            jobId: `spectator-${bootcamper.id}`,
          }
        );
      }

      // Add summoner name check if missing
      if (!hasNameJob) {
        missingJobs.push('name');
        await summonerNameQueue.add(
          `check-${bootcamper.id}`,
          {
            bootcamperId: bootcamper.id,
            puuid: bootcamper.puuid,
            region: bootcamper.region as RiotRegion,
          },
          {
            repeat: { every: 3600000 },
            jobId: `summoner-name-${bootcamper.id}`,
          }
        );
      }

      // Add current rank check if missing
      if (!hasCurrentRankJob) {
        missingJobs.push('current-rank');
        await rankQueue.add(
          'update-current-rank',
          {
            bootcamperId: bootcamper.id,
            puuid: bootcamper.puuid,
            region: bootcamper.region as RiotRegion,
          },
          {
            repeat: { every: 300000 },
            jobId: `periodic-current-rank-${bootcamper.id}`,
          }
        );
      }

      // Add peak rank check if missing
      if (!hasPeakRankJob) {
        missingJobs.push('peak-rank');
        await rankQueue.add(
          'check-rank-after-game',
          {
            bootcamperId: bootcamper.id,
            puuid: bootcamper.puuid,
            region: bootcamper.region as RiotRegion,
          },
          {
            repeat: { every: 300000 },
            jobId: `periodic-peak-rank-${bootcamper.id}`,
          }
        );
      }

      // Add Twitch check if applicable and missing
      if (bootcamper.twitchUserId && bootcamper.twitchLogin && !hasTwitchJob) {
        missingJobs.push('twitch');
        await twitchStreamQueue.add(
          `check-${bootcamper.id}`,
          {
            bootcamperId: bootcamper.id,
            twitchUserId: bootcamper.twitchUserId,
            twitchLogin: bootcamper.twitchLogin,
          },
          {
            repeat: { every: 60000 },
            jobId: `twitch-stream-${bootcamper.id}`,
          }
        );
      }

      if (missingJobs.length > 0) {
        console.log(`  ➕ Adding missing jobs for ${bootcamper.summonerName}: ${missingJobs.join(', ')}`);
        addedCount++;
      }
    }

    if (addedCount > 0 || removedCount > 0) {
      console.log(`✅ Sync complete: Added ${addedCount}, Removed ${removedCount}`);
    } else {
      console.log(`✅ All bootcampers in sync with jobs`);
    }
  } catch (error) {
    console.error('❌ Error syncing bootcampers with jobs:', error);
  }
}

/**
 * Clean up stale games on worker startup
 * Marks games as completed if bootcamper is no longer in-game
 */
async function cleanupStaleGames() {
  try {
    // Find all bootcampers marked as in_game
    const inGameBootcampers = await prisma.bootcamper.findMany({
      where: {
        status: 'in_game',
      },
      select: {
        id: true,
        summonerName: true,
        puuid: true,
        region: true,
        lastGameId: true,
        status: true,
      },
    });

    if (inGameBootcampers.length === 0) {
      console.log('  ✓ No in-game bootcampers to check');
      return;
    }

    console.log(`  📋 Checking ${inGameBootcampers.length} bootcampers marked as in-game...`);
    
    const riotClient = getRiotClient();
    let cleanedCount = 0;

    for (const bootcamper of inGameBootcampers) {
      try {
        // Check if they're actually in a game
        const activeGame = await riotClient.getActiveGame(
          bootcamper.region as RiotRegion,
          bootcamper.puuid
        );

        if (!activeGame && bootcamper.lastGameId) {
          // Game ended but wasn't marked as completed
          console.log(`  🧹 Cleaning up stale game for ${bootcamper.summonerName} (Game ID: ${bootcamper.lastGameId})`);
          
          await prisma.$transaction([
            // Update bootcamper status to idle
            prisma.bootcamper.update({
              where: { id: bootcamper.id },
              data: { status: 'idle' },
            }),
            // Mark game as completed
            prisma.game.updateMany({
              where: {
                riotGameId: bootcamper.lastGameId,
                bootcamperId: bootcamper.id,
                status: { in: ['live', 'in_progress'] },
              },
              data: {
                status: 'completed',
                endedAt: new Date(),
              },
            }),
          ]);
          
          cleanedCount++;
        }
      } catch (error) {
        // 404 means not in game - this is expected for cleanup
        if (error instanceof Error && error.message.includes('404')) {
          if (bootcamper.lastGameId) {
            console.log(`  🧹 Cleaning up stale game for ${bootcamper.summonerName} (Game ID: ${bootcamper.lastGameId})`);
            
            await prisma.$transaction([
              prisma.bootcamper.update({
                where: { id: bootcamper.id },
                data: { status: 'idle' },
              }),
              prisma.game.updateMany({
                where: {
                  riotGameId: bootcamper.lastGameId,
                  bootcamperId: bootcamper.id,
                  status: { in: ['live', 'in_progress'] },
                },
                data: {
                  status: 'completed',
                  endedAt: new Date(),
                },
              }),
            ]);
            
            cleanedCount++;
          }
        } else {
          console.error(`  ⚠️  Error checking ${bootcamper.summonerName}:`, error instanceof Error ? error.message : String(error));
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`  ✅ Cleaned up ${cleanedCount} stale game(s)`);
    } else {
      console.log(`  ✓ All in-game statuses are accurate`);
    }
  } catch (error) {
    console.error('❌ Error cleaning up stale games:', error);
  }
}

/**
 * Initialize worker system
 */
export async function initializeWorkers() {
  console.log('Initializing worker system...');
  
  // Create connection config for BullMQ
  console.log('Creating Redis connection config...');
  const connectionConfig = process.env.REDIS_SENTINEL_HOSTS ? {
    // Sentinel configuration
    sentinels: process.env.REDIS_SENTINEL_HOSTS.split(',').map(host => {
      const [hostname, port] = host.split(':');
      return { host: hostname, port: parseInt(port) };
    }),
    name: process.env.REDIS_SENTINEL_MASTER || 'mymaster',
    // CRITICAL: Explicitly specify master role for writes
    role: 'master',
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
    family: 4,
    // Additional resilience settings for Kubernetes
    connectTimeout: 60000,
    lazyConnect: true,
    maxLoadingTimeout: 0,
    retryDelayOnSentinelDown: 200,
    retryDelayOnFailover: 200,
    enableReadyCheck: false,
    // Keep connections alive
    keepAlive: 30000,
    autoResubscribe: true,
    autoResendUnfulfilledCommands: true,
    // Sentinel-specific settings to ensure master connection
    sentinelRetryDelayOnSentinelDown: 200,
    sentinelRetryDelayOnFailover: 200,
    preferredSlaves: [], // Empty to prefer master
    enableAutoPipelining: false, // Disable to avoid connection issues
  } : {
    // Direct Redis configuration
    host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
    port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port) || 6379,
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
    family: 4,
    connectTimeout: 10000,
    lazyConnect: true,
    keepAlive: 30000,
    autoResubscribe: true,
    autoResendUnfulfilledCommands: true,
  };
  
  // Create queues with individual connections
  console.log('Creating queues...');
  spectatorQueue = new Queue('spectator-checks', { connection: connectionConfig });
  matchDataQueue = new Queue('match-data', { connection: connectionConfig });
  twitchStreamQueue = new Queue('twitch-stream-checks', { connection: connectionConfig });
  summonerNameQueue = new Queue('summoner-name-updates', { connection: connectionConfig });
  rankQueue = new Queue('rank-checks', { connection: connectionConfig });
  playrateQueue = new Queue('playrate-updates', { connection: connectionConfig });
  
  // Create workers with individual connections
  console.log('Creating workers...');
  spectatorWorker = new Worker<SpectatorJobData>(
    'spectator-checks',
    async (job: Job<SpectatorJobData>) => {
      await checkSpectator(job.data);
    },
    {
      connection: connectionConfig,
      concurrency: 5,
    }
  );

  matchDataWorker = new Worker<MatchDataJobData>(
    'match-data',
    async (job: Job<MatchDataJobData>) => {
      await fetchMatchData(job.data);
    },
    {
      connection: connectionConfig,
      concurrency: 2,
    }
  );

  summonerNameWorker = new Worker<SummonerNameJobData>(
    'summoner-name-updates',
    async (job: Job<SummonerNameJobData>) => {
      await updateSummonerName(job.data);
    },
    {
      connection: connectionConfig,
      concurrency: 2,
    }
  );

  twitchStreamWorker = new Worker<TwitchStreamJobData>(
    'twitch-stream-checks',
    async (job: Job<TwitchStreamJobData>) => {
      await checkTwitchStream(job.data);
    },
    {
      connection: connectionConfig,
      concurrency: 3,
    }
  );

  rankWorker = new Worker<RankJobData>(
    'rank-checks',
    async (job: Job<RankJobData>) => {
      // Check if this is a post-game rank check or current rank update
      if (job.name === 'check-rank-after-game') {
        await checkAndUpdatePeakRank(job.data);
      } else if (job.name === 'update-current-rank') {
        await updateCurrentRank(job.data);
      }
    },
    {
      connection: connectionConfig,
      concurrency: 3,
    }
  );

  playrateWorker = new Worker(
    'playrate-updates',
    async () => {
      console.log('🎮 Starting champion playrate update...');
      await updateChampionPlayrates();
      console.log('✅ Champion playrate update completed');
    },
    {
      connection: connectionConfig,
      concurrency: 1, // Only one playrate update at a time
    }
  );
  
  // Set up event handlers with connection error handling
  spectatorWorker.on('completed', () => {
    // Silent success to avoid spam
  });

  spectatorWorker.on('failed', (job, err) => {
    // Only log non-404 failures and non-connection errors
    if (!(err.message && (err.message.includes('404') || err.message.includes('Connection is closed')))) {
      console.error(`❌ Spectator check failed for bootcamper ${job?.data.bootcamperId}:`, err.message);
    }
  });

  spectatorWorker.on('error', (err) => {
    if (!err.message.includes('Connection is closed')) {
      console.error('❌ Spectator worker error:', err.message);
    }
  });

  matchDataWorker.on('completed', (job) => {
    console.log(`Match data fetch completed for game ${job.data.gameId}`);
  });

  matchDataWorker.on('failed', (job, err) => {
    if (!err.message.includes('Connection is closed')) {
      console.error(`Match data fetch failed for game ${job?.data.gameId}:`, err.message);
    }
  });

  matchDataWorker.on('error', (err) => {
    if (!err.message.includes('Connection is closed')) {
      console.error('❌ Match data worker error:', err.message);
    }
  });

  summonerNameWorker.on('completed', () => {
    // Silent success to avoid spam
  });

  summonerNameWorker.on('failed', (job, err) => {
    if (!err.message.includes('Connection is closed')) {
      console.error(`Summoner name update failed for bootcamper ${job?.data.bootcamperId}:`, err.message);
    }
  });

  summonerNameWorker.on('error', (err) => {
    if (!err.message.includes('Connection is closed')) {
      console.error('❌ Summoner name worker error:', err.message);
    }
  });

  twitchStreamWorker.on('completed', () => {
    // Silent success to avoid spam
  });

  twitchStreamWorker.on('failed', (job, err) => {
    if (!err.message.includes('Connection is closed')) {
      console.error(`Twitch stream check failed for bootcamper ${job?.data.bootcamperId}:`, err.message);
    }
  });

  twitchStreamWorker.on('error', (err) => {
    if (!err.message.includes('Connection is closed')) {
      console.error('❌ Twitch stream worker error:', err.message);
    }
  });

  rankWorker.on('completed', () => {
    // Silent success to avoid spam
  });

  rankWorker.on('failed', (job, err) => {
    if (!err.message.includes('Connection is closed') && !err.message.includes('404')) {
      console.error(`Rank check failed for bootcamper ${job?.data.bootcamperId}:`, err.message);
    }
  });

  rankWorker.on('error', (err) => {
    if (!err.message.includes('Connection is closed')) {
      console.error('❌ Rank worker error:', err.message);
    }
  });

  playrateWorker.on('completed', () => {
    console.log('✅ Champion playrate update job completed');
  });

  playrateWorker.on('failed', (job, err) => {
    if (!err.message.includes('Connection is closed')) {
      console.error(`❌ Playrate update failed:`, err.message);
    }
  });

  playrateWorker.on('error', (err) => {
    if (!err.message.includes('Connection is closed')) {
      console.error('❌ Playrate worker error:', err.message);
    }
  });
  
  // Clear old jobs and reschedule with updated data
  console.log('Clearing old spectator jobs...');
  await spectatorQueue.obliterate({ force: true });
  
  console.log('Clearing old Twitch stream jobs...');
  await twitchStreamQueue.obliterate({ force: true });
  
  console.log('Clearing old summoner name jobs...');
  await summonerNameQueue.obliterate({ force: true });

  console.log('Clearing old rank jobs...');
  await rankQueue.obliterate({ force: true });
  
  // Clean up stale games on startup
  console.log('🧹 Cleaning up stale games...');
  await cleanupStaleGames();
  
  // Schedule initial spectator checks with new PUUID-based jobs
  await scheduleSpectatorChecks();
  
  // Schedule Twitch stream checks
  await scheduleTwitchStreamChecks();
  
  // Schedule summoner name checks (runs every hour)
  await scheduleSummonerNameChecks();

  // Schedule periodic rank checks (runs every 5 minutes)
  await schedulePeriodicRankChecks();

  // Schedule champion playrate updates (runs daily at midnight and on startup)
  console.log('Scheduling champion playrate updates...');
  
  // Clear old playrate jobs
  await playrateQueue.obliterate({ force: true });
  
  // Add initial playrate update (runs 5 seconds after startup)
  await playrateQueue.add(
    'update-playrates',
    {},
    {
      delay: 5000, // 5 second delay
      jobId: 'initial-playrate-update',
    }
  );
  console.log('  ✓ Scheduled initial playrate update (5s delay)');
  
  // Add daily playrate update at midnight (00:00)
  await playrateQueue.add(
    'update-playrates',
    {},
    {
      repeat: {
        pattern: '0 0 * * *', // Every day at midnight
      },
      jobId: 'daily-playrate-update',
    }
  );
  console.log('  ✓ Scheduled daily playrate update (midnight)');
  
  console.log('Worker system initialized successfully');
  
  // Start periodic bootcamper sync (every 2 minutes)
  setInterval(async () => {
    await syncBootcampersWithJobs();
  }, 120000); // 2 minutes
  
  // Run initial sync after 10 seconds
  setTimeout(async () => {
    await syncBootcampersWithJobs();
  }, 10000);
  
  // Start periodic stale game cleanup (every 5 minutes)
  setInterval(async () => {
    await cleanupStaleGames();
  }, 300000); // 5 minutes
  
  // Start periodic status logging
  startStatusLogger();
}

/**
 * Periodic status logger to show worker activity
 */
function startStatusLogger() {
  setInterval(async () => {
    try {
      console.log('📊 Worker Status Check...');
      
      // Check queue stats
      if (spectatorQueue) {
        const waiting = await spectatorQueue.getWaiting();
        const active = await spectatorQueue.getActive();
        const delayed = await spectatorQueue.getDelayed();
        console.log(`   Spectator Queue: ${waiting.length} waiting, ${active.length} active, ${delayed.length} delayed`);
      }
      
      if (matchDataQueue) {
        const waiting = await matchDataQueue.getWaiting();
        const active = await matchDataQueue.getActive();
        console.log(`   Match Data Queue: ${waiting.length} waiting, ${active.length} active`);
      }
      
      if (twitchStreamQueue) {
        const waiting = await twitchStreamQueue.getWaiting();
        const active = await twitchStreamQueue.getActive();
        const delayed = await twitchStreamQueue.getDelayed();
        console.log(`   Twitch Queue: ${waiting.length} waiting, ${active.length} active, ${delayed.length} delayed`);
      }
      
      if (summonerNameQueue) {
        const waiting = await summonerNameQueue.getWaiting();
        const active = await summonerNameQueue.getActive();
        const delayed = await summonerNameQueue.getDelayed();
        console.log(`   Summoner Name Queue: ${waiting.length} waiting, ${active.length} active, ${delayed.length} delayed`);
      }
      
      if (rankQueue) {
        const waiting = await rankQueue.getWaiting();
        const active = await rankQueue.getActive();
        const delayed = await rankQueue.getDelayed();
        console.log(`   Rank Queue: ${waiting.length} waiting, ${active.length} active, ${delayed.length} delayed`);
      }

      if (playrateQueue) {
        const waiting = await playrateQueue.getWaiting();
        const active = await playrateQueue.getActive();
        const delayed = await playrateQueue.getDelayed();
        console.log(`   Playrate Queue: ${waiting.length} waiting, ${active.length} active, ${delayed.length} delayed`);
      }
      
      // Check bootcamper count
      const bootcamperCount = await prisma.bootcamper.count({
        where: {
          startDate: { lte: new Date() },
          OR: [
            { plannedEndDate: { gte: new Date() } },
            { actualEndDate: { gte: new Date() } },
          ],
        },
      });
      
      console.log(`   📈 Active bootcampers: ${bootcamperCount}`);
      console.log('   ✅ Workers are alive and running');
      
    } catch (error) {
      console.error('❌ Status check error:', error);
    }
  }, 60000); // Every 60 seconds
}

/**
 * Shutdown worker system gracefully
 */
export async function shutdownWorkers() {
  console.log('Shutting down worker system...');
  
  if (spectatorWorker) await spectatorWorker.close();
  if (matchDataWorker) await matchDataWorker.close();
  if (twitchStreamWorker) await twitchStreamWorker.close();
  if (summonerNameWorker) await summonerNameWorker.close();
  if (rankWorker) await rankWorker.close();
  if (playrateWorker) await playrateWorker.close();
  if (spectatorQueue) await spectatorQueue.close();
  if (matchDataQueue) await matchDataQueue.close();
  if (twitchStreamQueue) await twitchStreamQueue.close();
  if (summonerNameQueue) await summonerNameQueue.close();
  if (rankQueue) await rankQueue.close();
  if (playrateQueue) await playrateQueue.close();
  
  console.log('Worker system shut down');
}

// Export queues for external use (after initialization)
export function getQueues() {
  return {
    spectatorQueue,
    matchDataQueue,
    twitchStreamQueue,
    summonerNameQueue,
    rankQueue,
    playrateQueue,
  };
}

export function getWorkers() {
  return {
    spectatorWorker,
    matchDataWorker,
    twitchStreamWorker,
    summonerNameWorker,
    rankWorker,
    playrateWorker,
  };
}