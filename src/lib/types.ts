// Riot API Types

export interface RiotSummonerDTO {
  id: string;
  accountId: string;
  puuid: string;
  name: string;
  profileIconId: number;
  revisionDate: number;
  summonerLevel: number;
}

export interface LeagueEntryDTO {
  leagueId: string;
  summonerId: string;
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak: boolean;
  veteran: boolean;
  freshBlood: boolean;
  inactive: boolean;
}

export interface CurrentGameInfo {
  gameId: number;
  gameType: string;
  gameStartTime: number;
  mapId: number;
  gameLength: number;
  platformId: string;
  gameMode: string;
  bannedChampions: BannedChampion[];
  gameQueueConfigId: number;
  observers: Observer;
  participants: CurrentGameParticipant[];
}

export interface CurrentGameParticipant {
  teamId: number;
  spell1Id: number;
  spell2Id: number;
  championId: number;
  profileIconId: number;
  riotId?: string;
  summonerName?: string; // Deprecated but may still exist
  riotIdGameName?: string; // Not in spectator v5
  riotIdTagline?: string; // Not in spectator v5  
  bot: boolean;
  summonerId?: string; // Deprecated in v5
  puuid: string; // v5 API uses puuid
  gameCustomizationObjects: Array<{ category: string; content: string }>;
  perks: Perks;
}

export interface BannedChampion {
  championId: number;
  teamId: number;
  pickTurn: number;
}

export interface Observer {
  encryptionKey: string;
}

export interface Perks {
  perkIds: number[];
  perkStyle: number;
  perkSubStyle: number;
}

export interface MatchDTO {
  metadata: Metadata;
  info: MatchInfo;
}

export interface Metadata {
  dataVersion: string;
  matchId: string;
  participants: string[];
}

export interface MatchInfo {
  gameCreation: number;
  gameDuration: number;
  gameEndTimestamp: number;
  gameId: number;
  gameMode: string;
  gameName: string;
  gameStartTimestamp: number;
  gameType: string;
  gameVersion: string;
  mapId: number;
  participants: ParticipantDTO[];
  platformId: string;
  queueId: number;
  teams: TeamDTO[];
  tournamentCode: string;
}

export interface ParticipantDTO {
  assists: number;
  baronKills: number;
  bountyLevel: number;
  champExperience: number;
  champLevel: number;
  championId: number;
  championName: string;
  championTransform: number;
  consumablesPurchased: number;
  damageDealtToBuildings: number;
  damageDealtToObjectives: number;
  damageDealtToTurrets: number;
  damageSelfMitigated: number;
  deaths: number;
  detectorWardsPlaced: number;
  doubleKills: number;
  dragonKills: number;
  firstBloodAssist: boolean;
  firstBloodKill: boolean;
  firstTowerAssist: boolean;
  firstTowerKill: boolean;
  gameEndedInEarlySurrender: boolean;
  gameEndedInSurrender: boolean;
  goldEarned: number;
  goldSpent: number;
  individualPosition: string;
  inhibitorKills: number;
  inhibitorTakedowns: number;
  inhibitorsLost: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  itemsPurchased: number;
  killingSprees: number;
  kills: number;
  lane: string;
  largestCriticalStrike: number;
  largestKillingSpree: number;
  largestMultiKill: number;
  longestTimeSpentLiving: number;
  magicDamageDealt: number;
  magicDamageDealtToChampions: number;
  magicDamageTaken: number;
  neutralMinionsKilled: number;
  nexusKills: number;
  nexusLost: number;
  nexusTakedowns: number;
  objectivesStolen: number;
  objectivesStolenAssists: number;
  participantId: number;
  pentaKills: number;
  physicalDamageDealt: number;
  physicalDamageDealtToChampions: number;
  physicalDamageTaken: number;
  profileIcon: number;
  puuid: string;
  quadraKills: number;
  riotIdGameName: string;
  riotIdTagline: string;
  role: string;
  sightWardsBoughtInGame: number;
  spell1Casts: number;
  spell2Casts: number;
  spell3Casts: number;
  spell4Casts: number;
  summoner1Casts: number;
  summoner1Id: number;
  summoner2Casts: number;
  summoner2Id: number;
  summonerId: string;
  summonerLevel: number;
  summonerName: string;
  teamEarlySurrendered: boolean;
  teamId: number;
  teamPosition: string;
  timeCCingOthers: number;
  timePlayed: number;
  totalDamageDealt: number;
  totalDamageDealtToChampions: number;
  totalDamageShieldedOnTeammates: number;
  totalDamageTaken: number;
  totalHeal: number;
  totalHealsOnTeammates: number;
  totalMinionsKilled: number;
  totalTimeCCDealt: number;
  totalTimeSpentDead: number;
  totalUnitsHealed: number;
  tripleKills: number;
  trueDamageDealt: number;
  trueDamageDealtToChampions: number;
  trueDamageTaken: number;
  turretKills: number;
  turretTakedowns: number;
  turretsLost: number;
  unrealKills: number;
  visionScore: number;
  visionWardsBoughtInGame: number;
  wardsKilled: number;
  wardsPlaced: number;
  win: boolean;
}

export interface TeamDTO {
  bans: BanDTO[];
  objectives: ObjectivesDTO;
  teamId: number;
  win: boolean;
}

export interface BanDTO {
  championId: number;
  pickTurn: number;
}

export interface ObjectivesDTO {
  baron: ObjectiveDTO;
  champion: ObjectiveDTO;
  dragon: ObjectiveDTO;
  inhibitor: ObjectiveDTO;
  riftHerald: ObjectiveDTO;
  tower: ObjectiveDTO;
}

export interface ObjectiveDTO {
  first: boolean;
  kills: number;
}

// Twitch API Types

export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  type: string;
  broadcaster_type: string;
  description: string;
  profile_image_url: string;
  offline_image_url: string;
  view_count: number;
  created_at: string;
}

export interface TwitchStream {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: string;
  title: string;
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
  tag_ids: string[];
  is_mature: boolean;
}

export interface TwitchEventSubSubscription {
  id: string;
  status: string;
  type: string;
  version: string;
  condition: Record<string, string>;
  transport: {
    method: string;
    callback: string;
  };
  created_at: string;
  cost: number;
}

export interface TwitchStreamOnlineEvent {
  id: string;
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  type: string;
  started_at: string;
}

export interface TwitchStreamOfflineEvent {
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
}

// App-specific types

export type RiotRegion = 'kr' | 'na1' | 'euw1' | 'eun1' | 'br1' | 'jp1' | 'la1' | 'la2' | 'oc1' | 'tr1' | 'ru';
export type RiotPlatformRegion = 'americas' | 'asia' | 'europe' | 'sea';

export const REGION_TO_PLATFORM: Record<RiotRegion, RiotPlatformRegion> = {
  kr: 'asia',
  na1: 'americas',
  euw1: 'europe',
  eun1: 'europe',
  br1: 'americas',
  jp1: 'asia',
  la1: 'americas',
  la2: 'americas',
  oc1: 'sea',
  tr1: 'europe',
  ru: 'europe',
};

export interface RateLimitInfo {
  appRateLimit: string;
  appRateLimitCount: string;
  methodRateLimit: string;
  methodRateLimitCount: string;
}
