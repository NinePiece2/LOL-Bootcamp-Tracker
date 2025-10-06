import { Queue, Worker, Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { getRiotClient } from '@/lib/riot-api';
import { getTwitchClient } from '@/lib/twitch-api';
import { RiotRegion, REGION_TO_PLATFORM } from '@/lib/types';
import { createRedisConnection } from '@/lib/redis';
import Redis from 'ioredis';

// Global connection and queue variables - initialized in initializeWorkers()
let redisConnection: Redis | null = null;
let spectatorQueue: Queue;
let matchDataQueue: Queue;
let twitchStreamQueue: Queue;
let summonerNameQueue: Queue;
let spectatorWorker: Worker;
let matchDataWorker: Worker;
let twitchStreamWorker: Worker;
let summonerNameWorker: Worker;

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
      const isNewGame = bootcamper.status !== 'in_game';
      
      if (isNewGame) {
        console.log(`🎮 Game started for ${bootcamper.summonerName} (ID: ${activeGame.gameId})`);
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
      }
      
      // Enrich participants with rank data
      console.log(`📊 Enriching ${activeGame.participants.length} participants with rank data...`);
      const enrichedParticipants = await Promise.all(
        activeGame.participants.map(async (participant) => {
          try {
            const playerName = participant.summonerName || participant.riotIdGameName || 'Unknown';
            console.log(`Fetching rank for ${playerName} (puuid: ${participant.puuid?.substring(0, 8)}...)...`);
            
            // Fetch rank data for each participant by their puuid (v5 API)
            const rankData = await riotClient.getLeagueEntries(region, participant.puuid);
            console.log(`Rank data received for ${playerName}:`, rankData);
            
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

      const enrichedMatchData = {
        ...activeGame,
        participants: enrichedParticipants,
      };
      
      // Always upsert the game record to ensure matchData is stored
      // This handles both new games and existing games that might not have matchData
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
            status: 'live',
            // @ts-expect-error - Prisma JSON type differences between local and Docker
            matchData: enrichedMatchData, // Store enriched lobby info
          },
          update: {
            status: 'live',
            // @ts-expect-error - Prisma JSON type differences between local and Docker
            matchData: enrichedMatchData, // Update enriched lobby info
          },
        }),
      ]);

      if (isNewGame) {
        // TODO: Emit WebSocket event for game started
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
              status: 'live',
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
          every: 30000, // Check every 30 seconds
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
 * Initialize worker system
 */
export async function initializeWorkers() {
  console.log('Initializing worker system...');
  
  // Create Redis connection
  console.log('Creating Redis connection...');
  redisConnection = createRedisConnection();
  
  // Wait for connection to be ready
  console.log('Waiting for Redis connection to be ready...');
  await redisConnection.ping();
  console.log('Redis connection established successfully');
  
  // Create queues
  console.log('Creating queues...');
  spectatorQueue = new Queue('spectator-checks', { connection: redisConnection });
  matchDataQueue = new Queue('match-data', { connection: redisConnection });
  twitchStreamQueue = new Queue('twitch-stream-checks', { connection: redisConnection });
  summonerNameQueue = new Queue('summoner-name-updates', { connection: redisConnection });
  
  // Create workers
  console.log('Creating workers...');
  spectatorWorker = new Worker<SpectatorJobData>(
    'spectator-checks',
    async (job: Job<SpectatorJobData>) => {
      await checkSpectator(job.data);
    },
    {
      connection: redisConnection,
      concurrency: 5,
    }
  );

  matchDataWorker = new Worker<MatchDataJobData>(
    'match-data',
    async (job: Job<MatchDataJobData>) => {
      await fetchMatchData(job.data);
    },
    {
      connection: redisConnection,
      concurrency: 2,
    }
  );

  summonerNameWorker = new Worker<SummonerNameJobData>(
    'summoner-name-updates',
    async (job: Job<SummonerNameJobData>) => {
      await updateSummonerName(job.data);
    },
    {
      connection: redisConnection,
      concurrency: 2,
    }
  );

  twitchStreamWorker = new Worker<TwitchStreamJobData>(
    'twitch-stream-checks',
    async (job: Job<TwitchStreamJobData>) => {
      await checkTwitchStream(job.data);
    },
    {
      connection: redisConnection,
      concurrency: 3,
    }
  );
  
  // Set up event handlers
  spectatorWorker.on('completed', () => {
    // Silent success to avoid spam
  });

  spectatorWorker.on('failed', (job, err) => {
    // Only log non-404 failures
    if (!(err.message && err.message.includes('404'))) {
      console.error(`❌ Spectator check failed for bootcamper ${job?.data.bootcamperId}:`, err);
    }
  });

  matchDataWorker.on('completed', (job) => {
    console.log(`Match data fetch completed for game ${job.data.gameId}`);
  });

  matchDataWorker.on('failed', (job, err) => {
    console.error(`Match data fetch failed for game ${job?.data.gameId}:`, err);
  });

  summonerNameWorker.on('completed', () => {
    // Silent success to avoid spam
  });

  summonerNameWorker.on('failed', (job, err) => {
    console.error(`Summoner name update failed for bootcamper ${job?.data.bootcamperId}:`, err);
  });

  twitchStreamWorker.on('completed', () => {
    // Silent success to avoid spam
  });

  twitchStreamWorker.on('failed', (job, err) => {
    console.error(`Twitch stream check failed for bootcamper ${job?.data.bootcamperId}:`, err);
  });
  
  // Clear old jobs and reschedule with updated data
  console.log('Clearing old spectator jobs...');
  await spectatorQueue.obliterate({ force: true });
  
  console.log('Clearing old Twitch stream jobs...');
  await twitchStreamQueue.obliterate({ force: true });
  
  console.log('Clearing old summoner name jobs...');
  await summonerNameQueue.obliterate({ force: true });
  
  // Schedule initial spectator checks with new PUUID-based jobs
  await scheduleSpectatorChecks();
  
  // Schedule Twitch stream checks
  await scheduleTwitchStreamChecks();
  
  // Schedule summoner name checks (runs every hour)
  await scheduleSummonerNameChecks();
  
  console.log('Worker system initialized successfully');
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
  if (spectatorQueue) await spectatorQueue.close();
  if (matchDataQueue) await matchDataQueue.close();
  if (twitchStreamQueue) await twitchStreamQueue.close();
  if (summonerNameQueue) await summonerNameQueue.close();
  if (redisConnection) await redisConnection.quit();
  
  console.log('Worker system shut down');
}

// Export queues for external use (after initialization)
export function getQueues() {
  return {
    spectatorQueue,
    matchDataQueue,
    twitchStreamQueue,
    summonerNameQueue,
  };
}

export function getWorkers() {
  return {
    spectatorWorker,
    matchDataWorker,
    twitchStreamWorker,
    summonerNameWorker,
  };
}