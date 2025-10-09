import React, { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { getChampionNameById } from "@/lib/utils";
import { identifyRoles } from "@/lib/role-identification";
import { GameProfileLinks } from "@/components/game-profile-links";

interface Participant {
  puuid: string;
  summonerId?: string;
  summonerName?: string | null;
  riotId?: string | null;
  riotIdGameName?: string | null;
  riotIdTagline?: string | null;
  championId: number;
  championName?: string | null;
  spell1Id: number;
  spell2Id: number;
  teamId: number;
  rank?: string | null;
  tier?: string | null;
  division?: string | null;
  leaguePoints?: number;
  inferredRole?: string;
}

interface GameData {
  id: string;
  startedAt: string;
  matchData?: {
    participants?: Participant[];
  };
}

interface Bootcamper {
  id: string;
  name?: string | null;
  summonerName: string;
  riotId?: string | null;
  puuid?: string;
  games?: GameData[];
}

interface LiveGamesSectionProps {
  inGameBootcampers: Bootcamper[];
  expandedLobby?: { [id: string]: boolean };
  onToggleLobby?: (id: string) => void;
  onLobbyClick?: (bootcamperId: string) => void;
  expandedByDefault?: boolean;
}

// Cache for champion names
const championNameCache: { [key: number]: string } = {};

const getChampionIconUrl = (championName: string) => {
  if (!championName) return "";
  return `https://raw.githubusercontent.com/noxelisdev/LoL_DDragon/master/latest/img/champion/${championName.replace(/\s/g, "")}.png`;
};

const getRankIconUrl = (tier: string | null | undefined) => {
  if (!tier) return null;
  const tierLower = tier.toLowerCase();
  return `/rank-images/${tierLower}.png`;
};

const LiveGamesSection: React.FC<LiveGamesSectionProps> = ({ 
  inGameBootcampers, 
  expandedLobby, 
  onToggleLobby,
  onLobbyClick,
  expandedByDefault = false
}) => {
  const [enrichedBootcampers, setEnrichedBootcampers] = useState<Bootcamper[]>([]);

  useEffect(() => {
    const enrichData = async () => {
      const enriched = await Promise.all(
        inGameBootcampers.map(async (bootcamper) => {
          const game = bootcamper.games?.[0];
          if (!game?.matchData?.participants) {
            console.warn('No matchData or participants for', bootcamper.summonerName);
            return bootcamper;
          }

          console.log('Raw participants from DB:', game.matchData.participants.map((p: Participant) => {
            const name = p.riotId || p.summonerName || p.riotIdGameName || 'Unknown';
            return {
              name,
              riotId: p.riotId,
              summonerName: p.summonerName,
              riotIdGameName: p.riotIdGameName,
              riotIdTagline: p.riotIdTagline,
              rank: p.rank,
              tier: p.tier,
              championId: p.championId,
              spell1: p.spell1Id,
              spell2: p.spell2Id,
              teamId: p.teamId,
              puuid: p.puuid?.substring(0, 8) + '...',
            };
          }));

          // Enrich participants with champion names and detect roles
          const enrichedParticipants = await Promise.all(
            game.matchData.participants.map(async (p: Participant) => {
              if (p.championId && !championNameCache[p.championId]) {
                const name = await getChampionNameById(p.championId);
                if (name) {
                  championNameCache[p.championId] = name;
                }
              }
              
              // IMPORTANT: Preserve all existing data including rank
              const enriched = {
                ...p, // This includes rank, tier, division, leaguePoints from workers
                championName: championNameCache[p.championId] || null,
              };
              
              const playerName = p.riotId || p.summonerName || p.riotIdGameName || 'Unknown';
              console.log(`Participant ${playerName}:`, {
                rank: enriched.rank,
                tier: enriched.tier,
                hasRankData: !!p.rank,
                championName: enriched.championName,
              });
              
              return enriched;
            })
          );

          // Detect roles for all participants using play rate algorithm (~90-95% accuracy)
          console.log('🎯 Starting role identification...');
          
          // Use the playrate-based role identification system
          const roleAssignments = await identifyRoles(enrichedParticipants);
          
          const participantsWithRoles = enrichedParticipants.map(p => {
            const role = roleAssignments.get(p.puuid) || 'MIDDLE';
            const playerName = p.riotId || p.summonerName || p.riotIdGameName || 'Unknown';
            console.log(`✓ ${playerName} (${p.championName || 'Unknown'}): ${role}`);
            
            return {
              ...p,
              inferredRole: role,
            };
          });
          
          // Log final role distribution
          console.log('Final role distribution:', participantsWithRoles.reduce((acc: Record<string, Record<string, number>>, p: Participant) => {
            const team = p.teamId === 100 ? 'Blue' : 'Red';
            if (!acc[team]) acc[team] = {};
            const role = p.inferredRole || 'UNKNOWN';
            acc[team][role] = (acc[team][role] || 0) + 1;
            return acc;
          }, {}));

          return {
            ...bootcamper,
            games: [{
              ...game,
              matchData: {
                ...game.matchData,
                participants: participantsWithRoles,
              },
            }],
          };
        })
      );
      setEnrichedBootcampers(enriched);
    };

    enrichData();
  }, [inGameBootcampers]);

  return (
    <div className="space-y-3">
      {enrichedBootcampers.length > 0 ? (
        enrichedBootcampers.map((bootcamper) => {
          const game = bootcamper.games?.[0];
          console.log("Game data for", bootcamper.summonerName, ":", game);
          console.log("matchData:", game?.matchData);
          const lobby = game?.matchData?.participants || [];
          console.log("Lobby participants:", lobby);
          if (lobby.length > 0) {
            console.log("Sample participant rank data:", {
              summonerName: lobby[0].summonerName,
              rank: lobby[0].rank,
              tier: lobby[0].tier,
              division: lobby[0].division,
              leaguePoints: lobby[0].leaguePoints,
            });
          }
          const self = lobby.find((p: Participant) => 
            p.summonerName === bootcamper.summonerName || 
            p.riotIdGameName === bootcamper.summonerName ||
            p.riotId === bootcamper.riotId ||
            p.puuid === bootcamper.puuid
          );
          const isExpanded = expandedByDefault || (expandedLobby?.[bootcamper.id] || false);
          
          const handleToggleClick = () => {
            if (onLobbyClick) {
              onLobbyClick(bootcamper.id);
            } else if (onToggleLobby) {
              onToggleLobby(bootcamper.id);
            }
          };
          
          return (
            <div
              key={bootcamper.id}
              className="p-3 bg-gray-900/50 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">
                    {bootcamper.name || bootcamper.summonerName}
                  </span>
                  <GameProfileLinks 
                    riotId={bootcamper.riotId || null}
                    summonerName={bootcamper.summonerName}
                    size="sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs text-green-400 font-medium">LIVE</span>
                </div>
              </div>
              {game && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">
                    Started {formatDistanceToNow(new Date(game.startedAt), { addSuffix: true })}
                  </span>
                  {self && (
                    <span className="flex items-center gap-1 text-xs text-blue-400 font-semibold">
                      Playing:
                      {self.championName && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={getChampionIconUrl(self.championName)}
                          alt={self.championName}
                          className="w-5 h-5 rounded-full border border-gray-700 bg-black"
                        />
                      )}
                      {self.championName}
                    </span>
                  )}
                  {!expandedByDefault && (
                    <button
                      className="ml-auto px-2 py-1 text-xs bg-gray-800 rounded hover:bg-gray-700 text-gray-300"
                      onClick={handleToggleClick}
                    >
                      {isExpanded ? "Hide Lobby" : "Show Lobby"}
                    </button>
                  )}
                </div>
              )}
              {isExpanded && lobby.length > 0 && (
                <div className="mt-3 bg-gray-950/80 rounded p-2 border border-gray-800">
                  <div className="space-y-4">
                    {/* Split into two teams */}
                    {[100, 200].map((teamId) => {
                      // Define role order for sorting (using API position names)
                      const roleOrder = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
                      
                      // Map API positions to display labels
                      const roleDisplayNames: Record<string, string> = {
                        'TOP': 'TOP',
                        'JUNGLE': 'JG',
                        'MIDDLE': 'MID',
                        'BOTTOM': 'ADC',
                        'UTILITY': 'SUP',
                      };
                      
                      const teamPlayers = lobby
                        .filter((p: Participant) => p.teamId === teamId)
                        .sort((a: Participant, b: Participant) => {
                          const aIndex = roleOrder.indexOf(a.inferredRole || 'MIDDLE');
                          const bIndex = roleOrder.indexOf(b.inferredRole || 'MIDDLE');
                          return aIndex - bIndex;
                        });
                      
                      if (teamPlayers.length === 0) return null;
                      
                      return (
                        <div key={teamId}>
                          <div className="text-xs font-semibold mb-2 text-gray-400">
                            {teamId === 100 ? '🔵 Blue Team' : '🔴 Red Team'}
                          </div>
                          <div className="space-y-1">
                            {teamPlayers.map((p: Participant) => {
                              console.log("Rendering player:", p);
                              const isBootcamper = p.summonerName === bootcamper.summonerName || 
                                                   p.riotIdGameName === bootcamper.summonerName ||
                                                   p.riotId === bootcamper.riotId ||
                                                   p.puuid === bootcamper.puuid;
                              const displayName = p.riotId || 
                                                   p.summonerName || 
                                                   (p.riotIdGameName && p.riotIdTagline ? `${p.riotIdGameName}#${p.riotIdTagline}` : p.riotIdGameName) || 
                                                   'Unknown';
                              return (
                                <div 
                                  key={p.puuid || p.summonerId || Math.random()} 
                                  className={`flex items-center gap-2 p-2 rounded ${isBootcamper ? 'bg-blue-900/30 border border-blue-700' : 'hover:bg-gray-900'}`}
                                >
                                  {p.championName && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={getChampionIconUrl(p.championName)}
                                      alt={p.championName}
                                      className="w-6 h-6 rounded-full border border-gray-700 bg-black flex-shrink-0"
                                    />
                                  )}
                                  <span className="text-xs text-gray-500 w-12 flex-shrink-0">
                                    {roleDisplayNames[p.inferredRole || 'TOP'] || p.inferredRole || 'UNKNOWN'}
                                  </span>
                                  <span className="font-medium text-white truncate flex-1">{displayName}</span>
                                  <GameProfileLinks 
                                    riotId={p.riotId || null}
                                    summonerName={p.summonerName || p.riotIdGameName || ''}
                                    size="sm"
                                    className="flex-shrink-0"
                                  />
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {p.tier && getRankIconUrl(p.tier) && (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={getRankIconUrl(p.tier) || ''}
                                        alt={p.tier}
                                        className="w-5 h-5"
                                        title={`${p.tier} ${p.division || ''}`}
                                      />
                                    )}
                                    <span className={`text-xs font-semibold ${
                                      p.tier === 'CHALLENGER' ? 'text-yellow-400' :
                                      p.tier === 'GRANDMASTER' ? 'text-red-400' :
                                      p.tier === 'MASTER' ? 'text-purple-400' :
                                      p.tier === 'DIAMOND' ? 'text-blue-400' :
                                      p.tier === 'PLATINUM' ? 'text-cyan-400' :
                                      p.tier === 'GOLD' ? 'text-yellow-500' :
                                      p.tier === 'SILVER' ? 'text-gray-400' :
                                      p.tier === 'BRONZE' ? 'text-orange-600' :
                                      'text-gray-500'
                                    }`}>
                                      {p.tier && (p.tier === 'MASTER' || p.tier === 'GRANDMASTER' || p.tier === 'CHALLENGER') 
                                        ? `${p.leaguePoints || 0} LP`
                                        : p.tier && p.division 
                                          ? `${p.division} ${p.leaguePoints || 0} LP` 
                                          : (p.rank || 'Unranked')}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div className="text-center py-8">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-800 flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500">No active games</p>
          <p className="text-xs text-gray-600 mt-1">Games will appear here when bootcampers start playing</p>
        </div>
      )}
    </div>
  );
};

export default LiveGamesSection;
