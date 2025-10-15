import Bottleneck from 'bottleneck';
import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  RiotSummonerDTO,
  CurrentGameInfo,
  MatchDTO,
  RiotRegion,
  RiotPlatformRegion,
  REGION_TO_PLATFORM,
  LeagueEntryDTO,
} from './types';

export class RiotAPIClient {
  private apiKey: string;
  private limiters: Map<string, Bottleneck>;
  private axiosInstances: Map<string, AxiosInstance>;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.limiters = new Map();
    this.axiosInstances = new Map();
    this.initializeLimiters();
  }

  private initializeLimiters() {
    // Default rate limits for Riot API (adjust based on your API key tier)
    // Production keys have higher limits
    
    // App-level rate limit: 20 requests per second, 100 per 2 minutes
    const appLimiter = new Bottleneck({
      reservoir: 20,
      reservoirRefreshAmount: 20,
      reservoirRefreshInterval: 1000,
      maxConcurrent: 10,
    });

    // Method-level rate limit (more conservative)
    const methodLimiter = new Bottleneck({
      reservoir: 10,
      reservoirRefreshAmount: 10,
      reservoirRefreshInterval: 1000,
      maxConcurrent: 5,
    });

    this.limiters.set('app', appLimiter);
    this.limiters.set('method', methodLimiter);
  }

  private getAxiosInstance(region: string): AxiosInstance {
    if (!this.axiosInstances.has(region)) {
      const instance = axios.create({
        baseURL: `https://${region}.api.riotgames.com`,
        headers: {
          'X-Riot-Token': this.apiKey,
        },
        timeout: 10000,
      });

      // Add response interceptor to handle rate limits
      instance.interceptors.response.use(
        (response) => {
          // Rate limit tracking disabled - can be enabled in future
          // this.updateRateLimits(response.headers);
          return response;
        },
        (error: AxiosError) => {
          if (error.response?.status === 403) {
            console.error('❌ Riot API 403 Forbidden');
            console.error('   Possible causes:');
            console.error('   1. API key is invalid or expired (dev keys expire every 24 hours)');
            console.error('   2. Using deprecated /by-name endpoint - use Riot ID instead');
            console.error('   3. API key lacks permissions for this endpoint');
            console.error('   Get a new key at: https://developer.riotgames.com/');
          }
          if (error.response?.status === 404) {
            // Only log 404s for non-spectator endpoints to avoid spam
            if (!error.config?.url?.includes('/spectator/')) {
              console.error('❌ Riot API 404 Not Found');
              console.error('   The summoner/account was not found.');
              console.error('   Check the Riot ID format: GameName#TAG (e.g., "Faker#KR1")');
            }
          }
          if (error.response?.status === 429) {
            console.error('Rate limit exceeded:', error.response.headers);
            // Retry-After header tells us when to retry
            const retryAfter = error.response.headers['retry-after'];
            if (retryAfter) {
              console.log(`Rate limited. Retry after ${retryAfter} seconds`);
            }
          }
          throw error;
        }
      );

      this.axiosInstances.set(region, instance);
    }
    return this.axiosInstances.get(region)!;
  }

  private async rateLimitedRequest<T>(
    region: string,
    path: string
  ): Promise<T> {
    const appLimiter = this.limiters.get('app')!;
    const methodLimiter = this.limiters.get('method')!;

    return await appLimiter.schedule(async () =>
      methodLimiter.schedule(async () => {
        const instance = this.getAxiosInstance(region);
        const response = await instance.get<T>(path);
        return response.data;
      })
    );
  }

  /**
   * Get account by Riot ID (gameName#tagLine)
   * Uses Account-V1 API which works across all Riot games
   */
  async getAccountByRiotId(
    region: RiotPlatformRegion,
    gameName: string,
    tagLine: string
  ): Promise<{ puuid: string; gameName: string; tagLine: string }> {
    const encodedGameName = encodeURIComponent(gameName);
    const encodedTagLine = encodeURIComponent(tagLine);
    return this.rateLimitedRequest<{ puuid: string; gameName: string; tagLine: string }>(
      region,
      `/riot/account/v1/accounts/by-riot-id/${encodedGameName}/${encodedTagLine}`
    );
  }

  /**
   * Get account by PUUID
   * Returns current gameName and tagLine for the account
   */
  async getAccountByPuuid(
    region: RiotPlatformRegion,
    puuid: string
  ): Promise<{ puuid: string; gameName: string; tagLine: string }> {
    return this.rateLimitedRequest<{ puuid: string; gameName: string; tagLine: string }>(
      region,
      `/riot/account/v1/accounts/by-puuid/${puuid}`
    );
  }

  /**
   * Get summoner by PUUID
   */
  async getSummonerByPuuid(
    region: RiotRegion,
    puuid: string
  ): Promise<RiotSummonerDTO> {
    return this.rateLimitedRequest<RiotSummonerDTO>(
      region,
      `/lol/summoner/v4/summoners/by-puuid/${puuid}`
    );
  }

  /**
   * Get summoner by Riot ID (recommended method)
   * Format: "gameName#tagLine" (e.g., "Hide on bush#KR1")
   */
  async getSummonerByRiotId(
    region: RiotRegion,
    riotId: string
  ): Promise<RiotSummonerDTO> {
    const [gameName, tagLine] = riotId.includes('#') 
      ? riotId.split('#')
      : [riotId, region.toUpperCase()];
    
    const platformRegion = REGION_TO_PLATFORM[region];
    const account = await this.getAccountByRiotId(platformRegion, gameName, tagLine);
    return this.getSummonerByPuuid(region, account.puuid);
  }

  /**
   * Get active game for a summoner by PUUID
   * Returns null if not in game
   */
  async getActiveGame(
    region: RiotRegion,
    puuid: string
  ): Promise<CurrentGameInfo | null> {
    try {
      return await this.rateLimitedRequest<CurrentGameInfo>(
        region,
        `/lol/spectator/v5/active-games/by-summoner/${puuid}`
      );
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        // 404 means summoner is not in a game
        return null;
      }
      throw error;
    }
  }

  /**
   * Get league entries for a summoner (ranked data)
   * Now uses PUUID instead of summonerId
   */
  async getLeagueEntries(
    region: RiotRegion,
    puuid: string
  ): Promise<LeagueEntryDTO[]> {
    try {
      return await this.rateLimitedRequest<LeagueEntryDTO[]>(
        region,
        `/lol/league/v4/entries/by-puuid/${puuid}`
      );
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.log('No ranked data found for PUUID:', puuid);
        return [];
      }
      throw error;
    }
  }


  /**
   * Get match by match ID
   */
  async getMatchById(
    region: RiotRegion,
    matchId: string
  ): Promise<MatchDTO> {
    const platformRegion = REGION_TO_PLATFORM[region];
    return this.rateLimitedRequest<MatchDTO>(
      platformRegion,
      `/lol/match/v5/matches/${matchId}`
    );
  }

  /**
   * Get match IDs for a PUUID
   */
  async getMatchIdsByPuuid(
    region: RiotRegion,
    puuid: string,
    options: {
      startTime?: number;
      endTime?: number;
      queue?: number;
      type?: string;
      start?: number;
      count?: number;
    } = {}
  ): Promise<string[]> {
    const platformRegion = REGION_TO_PLATFORM[region];
    const params = new URLSearchParams();
    
    if (options.startTime) params.append('startTime', options.startTime.toString());
    if (options.endTime) params.append('endTime', options.endTime.toString());
    if (options.queue) params.append('queue', options.queue.toString());
    if (options.type) params.append('type', options.type);
    if (options.start) params.append('start', options.start.toString());
    if (options.count) params.append('count', options.count.toString());

    const queryString = params.toString();
    const path = `/lol/match/v5/matches/by-puuid/${puuid}/ids${queryString ? `?${queryString}` : ''}`;

    return this.rateLimitedRequest<string[]>(platformRegion, path);
  }

  /**
   * Check if summoner is currently in a game by PUUID
   */
  async isInGame(region: RiotRegion, puuid: string): Promise<boolean> {
    const game = await this.getActiveGame(region, puuid);
    return game !== null;
  }
}

// Singleton instance
let riotClient: RiotAPIClient | null = null;

export function getRiotClient(): RiotAPIClient {
  if (!riotClient) {
    const apiKey = process.env.RIOT_API_KEY;
    if (!apiKey) {
      throw new Error('RIOT_API_KEY environment variable is not set');
    }
    riotClient = new RiotAPIClient(apiKey);
  }
  return riotClient;
}
