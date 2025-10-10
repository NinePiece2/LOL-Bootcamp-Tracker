import React, { useEffect, useState, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { getChampionNameById } from "@/lib/utils";
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

// OLD: use champion name string for icon URL
// const getChampionIconUrl = (championName: string) => {
//   if (!championName) return "";
//   return `https://raw.githubusercontent.com/noxelisdev/LoL_DDragon/master/latest/img/champion/${championName.replace(/\s/g, "")}.png`;
// };

// NEW: use champion id for icon URL (CommunityDragon)
const getChampionIconUrl = (championId?: number | null) => {
  if (!championId) return "";
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${championId}.png`;
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
  const [enrichedBootcampers, setEnrichedBootcampers] = useState<Map<string, Bootcamper>>(new Map());
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());
  const [currentChampions, setCurrentChampions] = useState<Record<string, { championId: number | null; championName: string | null }>>({});
  const fetchedChampionsRef = useRef<Set<string>>(new Set());

  // Only enrich bootcampers that are expanded or expanded by default
  useEffect(() => {
    const enrichData = async () => {
      // Determine which bootcampers need enrichment
      const idsToEnrich = inGameBootcampers
        .filter(bootcamper => {
          const isExpanded = expandedByDefault || (expandedLobby?.[bootcamper.id] || false);
          const alreadyEnriched = enrichedBootcampers.has(bootcamper.id);
          const currentlyEnriching = enrichingIds.has(bootcamper.id);
          return isExpanded && !alreadyEnriched && !currentlyEnriching;
        })
        .map(b => b.id);

      if (idsToEnrich.length === 0) return;

      // Mark these IDs as being enriched
      setEnrichingIds(prev => new Set([...prev, ...idsToEnrich]));

      // Enrich only the bootcampers that need it
      const bootcampersToEnrich = inGameBootcampers.filter(b => idsToEnrich.includes(b.id));
      
      const enriched = await Promise.all(
        bootcampersToEnrich.map(async (bootcamper) => {
          const game = bootcamper.games?.[0];
          if (!game?.matchData?.participants) {
            return bootcamper;
          }

          // Check if participants already have roles from the database
          const hasRoles = game.matchData.participants.some((p: Participant) => p.inferredRole);
          
          if (hasRoles) {
            // Roles already stored in DB - just enrich with champion names
            const enrichedParticipants = await Promise.all(
              game.matchData.participants.map(async (p: Participant) => {
                if (p.championId && !championNameCache[p.championId]) {
                  const name = await getChampionNameById(p.championId);
                  if (name) {
                    championNameCache[p.championId] = name;
                  }
                }
                
                return {
                  ...p,
                  championName: championNameCache[p.championId] || null,
                };
              })
            );

            return {
              ...bootcamper,
              games: [{
                ...game,
                matchData: {
                  ...game.matchData,
                  participants: enrichedParticipants,
                },
              }],
            };
          }

          // Fallback: roles not in DB (old games) - enrich with champion names and call API
          const enrichedParticipants = await Promise.all(
            game.matchData.participants.map(async (p: Participant) => {
              if (p.championId && !championNameCache[p.championId]) {
                const name = await getChampionNameById(p.championId);
                if (name) {
                  championNameCache[p.championId] = name;
                }
              }
              
              // IMPORTANT: Preserve all existing data including rank
              return {
                ...p, // This includes rank, tier, division, leaguePoints from workers
                championName: championNameCache[p.championId] || null,
              };
            })
          );

          // Call API to identify roles (server-side with champion playrate data)
          let participantsWithRoles = enrichedParticipants;
          
          try {
            const response = await fetch('/api/identify-roles', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ participants: enrichedParticipants }),
            });

            if (response.ok) {
              const { roles } = await response.json();
              
              participantsWithRoles = enrichedParticipants.map(p => ({
                ...p,
                inferredRole: roles[p.puuid] || 'MIDDLE',
              }));
            } else {
              console.error('Failed to identify roles:', response.statusText);
              // Fallback: use inferredRole from matchData if available
              participantsWithRoles = enrichedParticipants.map(p => ({
                ...p,
                inferredRole: p.inferredRole || 'MIDDLE',
              }));
            }
          } catch (error) {
            console.error('Error calling role identification API:', error);
            // Fallback: use inferredRole from matchData if available
            participantsWithRoles = enrichedParticipants.map(p => ({
              ...p,
              inferredRole: p.inferredRole || 'MIDDLE',
            }));
          }

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

      // Update the enriched map
      setEnrichedBootcampers(prev => {
        const newMap = new Map(prev);
        enriched.forEach(bootcamper => {
          newMap.set(bootcamper.id, bootcamper);
        });
        return newMap;
      });

      // Remove from enriching set
      setEnrichingIds(prev => {
        const newSet = new Set(prev);
        idsToEnrich.forEach(id => newSet.delete(id));
        return newSet;
      });
    };

    enrichData();
  }, [inGameBootcampers, expandedLobby, expandedByDefault, enrichedBootcampers, enrichingIds]);

  // Fetch current champion for all bootcampers immediately on page load
  useEffect(() => {
    const toFetchIds: string[] = [];

    inGameBootcampers.forEach((bootcamper) => {
      // Check if we've already fetched using the ref
      if (!fetchedChampionsRef.current.has(bootcamper.id)) {
        toFetchIds.push(bootcamper.id);
      }
    });

    if (toFetchIds.length === 0) return;

    // Mark all as fetched immediately to prevent duplicate requests
    toFetchIds.forEach(id => fetchedChampionsRef.current.add(id));

    let cancelled = false;

    const doFetch = async () => {
      // Fetch all in parallel
      const results = await Promise.allSettled(
        toFetchIds.map(async (id) => {
          if (cancelled) return null;
          
          try {
            const res = await fetch(`/api/current-champ?bootcamperId=${encodeURIComponent(id)}`);
            if (res.ok) {
              const data = await res.json();
              // Cache the champion name for future enrichments
              if (data.championId && data.championName && !championNameCache[data.championId]) {
                championNameCache[data.championId] = data.championName;
              }
              return { id, data };
            }
            return { id, data: { championId: null, championName: null } };
          } catch (err) {
            console.error('Error fetching current champ for', id, err);
            return { id, data: { championId: null, championName: null } };
          }
        })
      );

      if (!cancelled) {
        // Update all results at once
        setCurrentChampions(prev => {
          const updated = { ...prev };
          results.forEach((result) => {
            if (result.status === 'fulfilled' && result.value) {
              updated[result.value.id] = result.value.data;
            }
          });
          return updated;
        });
      }
    };

    doFetch();

    return () => { cancelled = true; };
  }, [inGameBootcampers]);

  return (
    <div className="space-y-3">
      {inGameBootcampers.length > 0 ? (
        inGameBootcampers.map((bootcamper) => {
          // Use enriched version if available, otherwise use original
          const displayBootcamper = enrichedBootcampers.get(bootcamper.id) || bootcamper;
          const game = displayBootcamper.games?.[0];
          const lobby = game?.matchData?.participants || [];
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
                  {(() => {
                    const fetched = currentChampions[bootcamper.id];
                    // Prioritize champion id/name from immediate fetch or participant data
                    const champId = fetched?.championId ?? self?.championId ?? null;
                    const champName = fetched?.championName ?? self?.championName ?? (champId ? championNameCache[champId] : null);
                    
                    // Show "Playing:" if we have champion data from any source
                    if (champId || champName) {
                      return (
                        <span className="flex items-center gap-1 text-xs text-blue-400 font-semibold">
                          Playing:
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getChampionIconUrl(champId)}
                            alt={champName || String(champId)}
                            className="w-5 h-5 rounded-full border border-gray-700 bg-black"
                          />
                          {champName}
                        </span>
                      );
                    }
                     return null;
                  })()}
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
                      
                      // Map API positions to image filenames
                      const roleToImageFile: Record<string, string> = {
                        'TOP': 'top.png',
                        'JUNGLE': 'jungle.png',
                        'MIDDLE': 'middle.png',
                        'BOTTOM': 'bottom.png',
                        'UTILITY': 'support.png',
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
                              
                              // Check if this participant is ANY bootcamper (not just the current one)
                              const isBootcamper = inGameBootcampers.some(bc => 
                                p.summonerName === bc.summonerName || 
                                p.riotIdGameName === bc.summonerName ||
                                p.riotId === bc.riotId ||
                                p.puuid === bc.puuid
                              );
                              
                              // Find the matching bootcamper to get their display name
                              const matchingBootcamper = inGameBootcampers.find(bc => 
                                p.summonerName === bc.summonerName || 
                                p.riotIdGameName === bc.summonerName ||
                                p.riotId === bc.riotId ||
                                p.puuid === bc.puuid
                              );
                              
                              // Format: Riot ID (Display Name) or just Riot ID/Summoner Name
                              let displayName: string;
                              if (matchingBootcamper) {
                                // This is a bootcamper - show Riot ID (Display Name)
                                displayName = matchingBootcamper.riotId 
                                  ? (matchingBootcamper.name ? `${matchingBootcamper.riotId} (${matchingBootcamper.name})` : matchingBootcamper.riotId)
                                  : (matchingBootcamper.name ? `${matchingBootcamper.summonerName} (${matchingBootcamper.name})` : matchingBootcamper.summonerName);
                              } else {
                                // Regular player - just show their name
                                displayName = p.riotId || 
                                             p.summonerName || 
                                             (p.riotIdGameName && p.riotIdTagline ? `${p.riotIdGameName}#${p.riotIdTagline}` : p.riotIdGameName) || 
                                             'Unknown';
                              }
                              
                              const roleImage = roleToImageFile[p.inferredRole || 'TOP'] || 'unknown.png';
                              
                              return (
                                <div 
                                  key={p.puuid || p.summonerId || Math.random()} 
                                  className={`flex items-center gap-2 p-2 rounded ${isBootcamper ? 'bg-blue-900/30 border border-blue-700' : 'hover:bg-gray-900'}`}
                                >
                                  {/* Role Icon */}
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={`/positions/${roleImage}`}
                                    alt={p.inferredRole || 'Unknown'}
                                    className="w-5 h-5 flex-shrink-0"
                                    title={p.inferredRole || 'Unknown'}
                                  />
                                  {p.championName && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={getChampionIconUrl(p.championId)}
                                      alt={p.championName || String(p.championId)}
                                      className="w-6 h-6 rounded-full border border-gray-700 bg-black flex-shrink-0"
                                    />
                                  )}
                                  <span className="font-medium text-white truncate flex-1">{displayName}</span>
                                  <GameProfileLinks 
                                    riotId={p.riotId || null}
                                    summonerName={p.summonerName || p.riotIdGameName || ''}
                                    size="sm"
                                    className="flex-shrink-0"
                                  />
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
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
                                        ? `${p.tier.charAt(0) + p.tier.slice(1).toLowerCase()} ${p.leaguePoints || 0} LP`
                                        : p.tier && p.division 
                                          ? `${p.tier.charAt(0) + p.tier.slice(1).toLowerCase()} ${p.division} ${p.leaguePoints || 0} LP` 
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
