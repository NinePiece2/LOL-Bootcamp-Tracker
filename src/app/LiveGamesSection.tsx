import React, { useEffect, useState, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { getChampionNameById } from "@/lib/utils";
import { GameProfileLinks } from "@/components/game-profile-links";

interface Perks{
  perkIds: number[];
  perkStyle: number;
  perkSubStyle: number;
}

interface BannedChampion {
  championId: number;
  teamId: number;
  pickTurn: number;
}

interface BannedChampion {
  championId: number;
  teamId: number;
  pickTurn: number;
}

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
  perks: Perks;
}

interface GameData {
  id: string;
  startedAt: string;
  matchData?: {
    participants?: Participant[];
    bannedChampions?: BannedChampion[];
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
  focusBootcamperId?: string | null;
  focusOnly?: boolean;
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

// Make prettified champion names like "TwistedFate" -> "Twisted Fate"
const prettifyChampionName = (name?: string | null) => {
  if (!name) return null;
  return name.replace(/([a-z])([A-Z])/g, '$1 $2');
};

const getRankIconUrl = (tier: string | null | undefined) => {
  // If no tier is provided, fall back to the unranked emblem
  if (!tier) return '/rank-images/unranked.png';
  const tierLower = tier.toLowerCase();
  return `/rank-images/${tierLower}.png`;
};

const getSummonerSpellIconUrl = (spellId?: number | null) => {
  if (!spellId) return '';
  const known: Record<number, string> = {
    4: 'summoner_flash.png',
    12: 'summoner_teleport_new.png',
    14: 'summonerignite.png',
    11: 'summoner_smite.png',
    3: 'summoner_exhaust.png',
    7: 'summoner_heal.png',
    21: 'summonerbarrier.png',
    // Ghost
    6: 'summoner_haste.png',
    // Cleanse
    1: 'summoner_boost.png',
  };

  const file = known[spellId] || `summoner_${spellId}.png`;
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/data/spells/icons2d/${file}`;
};

const getKeystoneIconUrl = (perkIds?: number[] | null) => {
  if (!perkIds || perkIds.length === 0) return '';
  const id = perkIds[0];
  return `https://opgg-static.akamaized.net/meta/images/lol/latest/perk/${id}.png`;
};

const getPerkStyleIconUrl = (styleId?: number | null) => {
  if (!styleId) return '';
  return `https://opgg-static.akamaized.net/meta/images/lol/latest/perkStyle/${styleId}.png`;
};

const LiveGamesSection: React.FC<LiveGamesSectionProps> = ({ 
  inGameBootcampers, 
  expandedLobby, 
  onToggleLobby,
  onLobbyClick,
  expandedByDefault = false,
  focusBootcamperId = null,
  focusOnly = false,
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
              participantsWithRoles = enrichedParticipants.map(p => ({
                ...p,
                inferredRole: p.inferredRole || 'MIDDLE',
              }));
            }
          } catch (error) {
            console.error('Error calling role identification API:', error);
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

    const participantGameMap = new Map<string, GameData>();
    const normalizeKey = (s?: string | null) => {
      if (!s) return null;
      try {
        return s.toLowerCase().normalize('NFKD').trim();
      } catch {
        return s.toLowerCase().trim();
      }
    };

    const addBootcamperToMap = (b: Bootcamper) => {
      const g = b.games?.[0];
      if (!g?.matchData?.participants) return;
      for (const p of g.matchData.participants) {
        if (p.puuid) participantGameMap.set(p.puuid, g);

        const summ = normalizeKey(p.summonerName);
        if (summ) participantGameMap.set(summ, g);

        if (p.riotId) {
          const riot = normalizeKey(p.riotId);
          if (riot) participantGameMap.set(riot, g);
          // also map prefix before '#', e.g. 'BROHAN#Haki' -> 'brohan'
          const prefix = p.riotId.split('#')[0];
          const normPrefix = normalizeKey(prefix);
          if (normPrefix) participantGameMap.set(normPrefix, g);
        }

        if (p.riotIdGameName) {
          const gameName = normalizeKey(p.riotIdGameName);
          if (gameName) participantGameMap.set(gameName, g);
          if (p.riotIdTagline) {
            const combo = `${p.riotIdGameName}#${p.riotIdTagline}`;
            const comboKey = normalizeKey(combo);
            if (comboKey) participantGameMap.set(comboKey, g);
          }
        }
      }
    };

    // Populate map with enriched bootcampers first (preferred), then raw inGameBootcampers
    for (const [, val] of enrichedBootcampers) {
      addBootcamperToMap(val as Bootcamper);
    }
    for (const b of inGameBootcampers) {
      addBootcamperToMap(b as Bootcamper);
    }

    // Shared matcher used in multiple render paths (focus-only lobby + per-row rendering)
    const matchesParticipant = (p: Participant, b: Bootcamper) => {
      return (
        (p.puuid && b.puuid && p.puuid === b.puuid) ||
        (p.summonerName && b.summonerName && p.summonerName.toLowerCase() === b.summonerName.toLowerCase()) ||
        (p.riotId && b.riotId && p.riotId.toLowerCase() === b.riotId.toLowerCase()) ||
        // match riotId prefixes like 'BROHAN#Haki' -> 'BROHAN'
        (p.riotId && b.riotId && p.riotId.split('#')[0].toLowerCase() === b.riotId.split('#')[0].toLowerCase()) ||
        (p.riotIdGameName && b.summonerName && p.riotIdGameName.toLowerCase() === b.summonerName.toLowerCase())
      );
    };

    // Tier color map (copied from leaderboard for consistent LP display)
    const tierColors: Record<string, string> = {
      CHALLENGER: 'text-cyan-400 font-bold',
      GRANDMASTER: 'text-red-500 font-bold',
      MASTER: 'text-purple-500 font-bold',
      DIAMOND: 'text-blue-400',
      EMERALD: 'text-emerald-500',
      PLATINUM: 'text-teal-400',
      GOLD: 'text-yellow-500',
      SILVER: 'text-gray-400',
      BRONZE: 'text-amber-700',
      IRON: 'text-stone-500',
    };

  // If a focusBootcamperId is provided, resolve their game once and render the details
  let focusedBootcamper: Bootcamper | null = null;
  let focusedGame: GameData | null = null;
  let focusedSelf: Participant | undefined;
  let focusedIsExpanded = false;

  if (focusBootcamperId) {
    focusedBootcamper = inGameBootcampers.find(b => b.id === focusBootcamperId) || enrichedBootcampers.get(focusBootcamperId) || null;
    if (focusedBootcamper) {
      // Prefer the bootcamper's own game
      focusedGame = (enrichedBootcampers.get(focusedBootcamper.id) || focusedBootcamper).games?.[0] || null;
      if (!focusedGame) {
        // Try participantGameMap lookups
        if (focusedBootcamper.puuid && participantGameMap.has(focusedBootcamper.puuid)) focusedGame = participantGameMap.get(focusedBootcamper.puuid) || null;
        const summ = normalizeKey(focusedBootcamper.summonerName);
        if (!focusedGame && summ && participantGameMap.has(summ)) focusedGame = participantGameMap.get(summ) || null;
        const riotk = normalizeKey(focusedBootcamper.riotId || undefined);
        if (!focusedGame && riotk && participantGameMap.has(riotk)) focusedGame = participantGameMap.get(riotk) || null;
      }
      if (focusedBootcamper) {
        focusedSelf = focusedGame?.matchData?.participants?.find(p => p.puuid === focusedBootcamper!.puuid || (p.summonerName && p.summonerName.toLowerCase() === focusedBootcamper!.summonerName.toLowerCase()));
        focusedIsExpanded = expandedByDefault || (expandedLobby?.[focusedBootcamper.id] || false);
      }
    }
  }

  // Track which game IDs we've already rendered a lobby for to avoid duplicates
  const renderedGameIds = new Set<string>();
  if (focusOnly && focusedGame && focusedGame.id) {
    renderedGameIds.add(focusedGame.id);
  }

  // When in focusOnly mode, build a set of bootcamper IDs that belong to the focused game
  // so we can completely skip rendering their top-level cards (the focused lobby already shows them).
  const focusedGameBootcamperIds = new Set<string>();
  if (focusOnly && focusedGame && focusedGame.matchData?.participants) {
    for (const p of focusedGame.matchData.participants) {
      const matching = inGameBootcampers.find(b => matchesParticipant(p, b));
      if (matching) focusedGameBootcamperIds.add(matching.id);
    }
  }

  return (
    <div className="space-y-3">
      {/* Focused bootcamper details (render once) */}
      {focusedBootcamper && focusedGame && (
        <div className="p-4 bg-gradient-to-r from-gray-900/60 to-gray-900/30 rounded-xl border border-gray-800 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* avatar: prefer champion icon, fall back to role icon, then initial */}
              <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center bg-black border border-gray-700">
                {(() => {
                  const fetched = currentChampions[focusedBootcamper!.id];
                  const champId = fetched?.championId ?? focusedSelf?.championId ?? null;
                  const role = focusedSelf?.inferredRole || 'TOP';
                  const roleToImageFile: Record<string, string> = {
                    'TOP': 'top.png',
                    'JUNGLE': 'jungle.png',
                    'MIDDLE': 'middle.png',
                    'BOTTOM': 'bottom.png',
                    'UTILITY': 'support.png',
                  };

                  if (champId) {
                    return (
                      (() => {
                        const rawName = fetched?.championName ?? focusedSelf?.championName ?? (champId ? championNameCache[champId] : null);
                        const titleName = prettifyChampionName(rawName) || '';
                        return (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={getChampionIconUrl(champId)}
                            alt={titleName || String(champId)}
                            title={titleName || undefined}
                            aria-label={titleName || undefined}
                            className="w-full h-full object-cover"
                          />
                        );
                      })()
                    );
                  }

                  const roleImg = roleToImageFile[role] || 'unknown.png';
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/positions/${roleImg}`} alt={role} className="w-8 h-8" />
                  );
                })()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-white">{focusedBootcamper.name || focusedBootcamper.summonerName}</span>
                  <GameProfileLinks riotId={focusedBootcamper.riotId || null} summonerName={focusedBootcamper.summonerName} size="sm" />
                </div>
                <div className="text-xs text-gray-400 mt-1">Started {formatDistanceToNow(new Date(focusedGame.startedAt), { addSuffix: true })}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center gap-2 bg-red-600/10 border border-red-600 text-red-300 text-xs px-2 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                In Game
              </div>
              {(() => {
                const fetched = currentChampions[focusedBootcamper!.id];
                const champId = fetched?.championId ?? focusedSelf?.championId ?? null;
                const rawChampName = fetched?.championName ?? focusedSelf?.championName ?? (champId ? championNameCache[champId] : null);
                const champName = prettifyChampionName(rawChampName);
                if (champId || champName) {
                  return (
                    <div className="flex items-center gap-2 bg-gray-800/60 px-2 py-1 rounded">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getChampionIconUrl(champId)}
                        alt={champName || String(champId)}
                        title={champName || undefined}
                        aria-label={champName || undefined}
                        className="w-6 h-6 rounded-full border border-gray-700 bg-black"
                      />
                      <span className="text-sm text-amber-300 font-medium">{champName}</span>
                    </div>
                  );
                }
                return null;
              })()}
              {!expandedByDefault && (
                <button className="px-3 py-1 text-xs bg-gray-800 rounded hover:bg-gray-700 text-gray-300" onClick={() => { if (onLobbyClick) onLobbyClick(focusedBootcamper!.id); else if (onToggleLobby) onToggleLobby(focusedBootcamper!.id); }}>
                  {focusedIsExpanded ? 'Hide Lobby' : 'Show Lobby'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* If we're in focusOnly mode, render the full lobby once for the focused bootcamper (if expanded) */}
      {focusOnly && focusedBootcamper && focusedGame && (focusedIsExpanded || expandedByDefault) && (
        <div className="mt-3 bg-gradient-to-b from-gray-900/40 to-gray-900/10 rounded-lg border border-gray-800 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[100, 200].map((teamId) => {
              const roleOrder = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
              const teamPlayers = (focusedGame.matchData?.participants || [])
                .filter((p: Participant) => p.teamId === teamId)
                .sort((a: Participant, b: Participant) => {
                  const aIndex = roleOrder.indexOf(a.inferredRole || 'MIDDLE');
                  const bIndex = roleOrder.indexOf(b.inferredRole || 'MIDDLE');
                  return aIndex - bIndex;
                });

              if (teamPlayers.length === 0) return null;

              return (
                <div key={teamId} className="bg-gray-900/40 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                          <span className={`h-3 w-3 rounded-full ${teamId === 100 ? 'bg-blue-400' : 'bg-red-400'}`} />
                          <span className="text-sm font-semibold text-gray-300">{teamId === 100 ? 'Blue Team' : 'Red Team'}</span>
                          {/* Render banned champions for this team as small squares with a label */}
                          <div className="flex items-center gap-1 ml-3">
                            <span className="text-xs text-gray-400 mr-1">Bans</span>
                            {(focusedGame.matchData?.bannedChampions || []).filter((b: BannedChampion) => b.teamId === teamId).map((ban: BannedChampion) => {
                              const raw = championNameCache[ban.championId] || null;
                              const nice = prettifyChampionName(raw) || '';
                              return (
                                <div key={`ban-${teamId}-${ban.pickTurn}-${ban.championId}`} className="w-7 h-7 rounded-sm border border-gray-700 overflow-hidden bg-black">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={getChampionIconUrl(ban.championId)}
                                    alt={nice || String(ban.championId)}
                                    title={nice || undefined}
                                    aria-label={nice || undefined}
                                    className="w-full h-full object-cover transform scale-110"
                                  />
                                </div>
                              );
                            })}
                          </div>
                    </div>
                    <span className="text-xs text-gray-400">{teamPlayers.length} players</span>
                  </div>

                  <div className="space-y-2">
                          {teamPlayers.map((p: Participant) => {
                            const isBootcamper = inGameBootcampers.some(bc => matchesParticipant(p, bc));
                            const matchingBootcamper = inGameBootcampers.find(bc => matchesParticipant(p, bc));
                            const displayName = matchingBootcamper
                              ? (matchingBootcamper.riotId ? (matchingBootcamper.name ? `${matchingBootcamper.riotId} (${matchingBootcamper.name})` : matchingBootcamper.riotId) : (matchingBootcamper.name ? `${matchingBootcamper.summonerName} (${matchingBootcamper.name})` : matchingBootcamper.summonerName))
                              : (p.riotId || p.summonerName || (p.riotIdGameName && p.riotIdTagline ? `${p.riotIdGameName}#${p.riotIdTagline}` : p.riotIdGameName) || 'Unknown');

                            const roleToImageFile: Record<string, string> = {
                              'TOP': 'top.png',
                              'JUNGLE': 'jungle.png',
                              'MIDDLE': 'middle.png',
                              'BOTTOM': 'bottom.png',
                              'UTILITY': 'support.png',
                            };
                            const roleImage = roleToImageFile[p.inferredRole || 'TOP'] || 'unknown.png';

                            return (
                              <div key={p.puuid || p.summonerId || Math.random()} className={`flex items-center gap-3 p-2 rounded-md hover:bg-gray-900/40 transition ${isBootcamper ? 'ring-2 ring-amber-600/30 bg-amber-600/6' : ''}`}>
                                <div className="flex items-center gap-2">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={`/positions/${roleImage}`} alt={p.inferredRole || 'Unknown'} className="w-6 h-6" />
                                  <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center bg-black border border-gray-700 relative">
                                    {p.championId ? (
                                      (() => {
                                        const raw = p.championName || (p.championId ? championNameCache[p.championId] : null);
                                        const nice = prettifyChampionName(raw) || '';
                                        return (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            src={getChampionIconUrl(p.championId)}
                                            alt={nice || String(p.championId)}
                                            title={nice || undefined}
                                            aria-label={nice || undefined}
                                            className="w-10 h-10 object-cover"
                                          />
                                        );
                                      })()
                                    ) : (
                                      <div className="text-xs text-gray-400">{(p.summonerName || p.riotIdGameName || 'P').charAt(0).toUpperCase()}</div>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-center gap-1">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={getKeystoneIconUrl(p.perks?.perkIds)} alt="keystone-style" className="w-5 h-5" />
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={getPerkStyleIconUrl(p.perks?.perkSubStyle)} alt="perk-substyle" className="w-4 h-4" />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="flex flex-col items-center gap-1">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={getSummonerSpellIconUrl(p.spell1Id)} alt={`spell-${p.spell1Id}`} className="w-5 h-5" />
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={getSummonerSpellIconUrl(p.spell2Id)} alt={`spell-${p.spell2Id}`} className="w-5 h-5" />
                                    </div>
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-white truncate">{displayName}</span>
                                  </div>
                                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1">
                                      {/* Always show an emblem; getRankIconUrl falls back to unranked.png when tier is falsy */}
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={getRankIconUrl(p.tier) || ''} alt={p.tier || 'Unranked'} className="w-4 h-4" />
                                      {(() => {
                                        const rawTier = p.tier || '';
                                        const up = rawTier ? rawTier.toUpperCase() : '';
                                        const tierDisplay = rawTier ? (rawTier.charAt(0) + rawTier.slice(1).toLowerCase()) : (p.rank || 'Unranked');
                                        const isMajor = up === 'MASTER' || up === 'GRANDMASTER' || up === 'CHALLENGER';
                                        return (
                                          <>
                                            <span className={`text-xs font-semibold ${tierColors[up || ''] || 'text-gray-400'}`}>
                                              {tierDisplay}{!isMajor && p.division ? ` ${p.division}` : ''}
                                            </span>
                                            <span className="text-[11px] text-gray-400">{p.leaguePoints ?? 0} LP</span>
                                          </>
                                        );
                                      })()}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <GameProfileLinks riotId={p.riotId || null} summonerName={p.summonerName || p.riotIdGameName || ''} size="sm" className="flex-shrink-0" />
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
      {inGameBootcampers.length > 0 ? (
        inGameBootcampers.map((bootcamper) => {
          // If we're focusing on a game, skip rendering the top-level card for any bootcamper
          // that is part of the focused game to avoid duplicate headers/lobbies.
          if (focusOnly && focusedGame && focusedGameBootcamperIds.has(bootcamper.id)) {
            return null;
          }
          // Use enriched version if available, otherwise use original
          const enriched = enrichedBootcampers.get(bootcamper.id) || bootcamper;

          // Determine game: prefer this bootcamper's game, but if missing try to find another
          // bootcamper's game using the participantGameMap so players in the same match share lobby data.
          let game = enriched.games?.[0];

          // Helper to find from map keys
          const lookupGameFromMap = () => {
            if (bootcamper.puuid && participantGameMap.has(bootcamper.puuid)) return participantGameMap.get(bootcamper.puuid) || null;
            if (bootcamper.summonerName && participantGameMap.has(bootcamper.summonerName.toLowerCase())) return participantGameMap.get(bootcamper.summonerName.toLowerCase()) || null;
            if ((bootcamper.riotId) && participantGameMap.has(bootcamper.riotId.toLowerCase())) return participantGameMap.get(bootcamper.riotId.toLowerCase()) || null;
            return null;
          };

          if (!game) {
            // Try fast lookup from map built earlier
            const mapped = lookupGameFromMap();
            if (mapped) {
              game = mapped;
            }
          }

          if (!game) {
            for (const [, val] of enrichedBootcampers) {
              const g = val.games?.[0];
              if (g?.matchData?.participants?.some(p => matchesParticipant(p, bootcamper))) {
                  game = g;
                  break;
                }
            }
          }

          const lobby = game?.matchData?.participants || [];
          const shouldRenderDetails = Boolean(game && !focusOnly && (!focusBootcamperId || focusBootcamperId === bootcamper.id));

          const self = lobby.find((p: Participant) => matchesParticipant(p, bootcamper));
          const isExpanded = expandedByDefault || (expandedLobby?.[bootcamper.id] || false);
          const alreadyRendered = Boolean(game && game.id && renderedGameIds.has(game.id));
          
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
              {shouldRenderDetails && !alreadyRendered && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">
                    Started {game?.startedAt ? formatDistanceToNow(new Date(game.startedAt), { addSuffix: true }) : 'recently'}
                  </span>
                  {(() => {
                    const fetched = currentChampions[bootcamper.id];
                    // Prioritize champion id/name from immediate fetch or participant data
                    const champId = fetched?.championId ?? self?.championId ?? null;
                    const rawChampName = fetched?.championName ?? self?.championName ?? (champId ? championNameCache[champId] : null);
                    const champName = prettifyChampionName(rawChampName);
                    
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
              {isExpanded && lobby.length > 0 && !focusOnly && !alreadyRendered && (
                <div className="mt-3 bg-gray-950/80 rounded p-2 border border-gray-800">
                  <div className="space-y-4">
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
                            <div className="text-xs font-semibold mb-2 text-gray-400 flex items-center gap-2">
                            <span>{teamId === 100 ? '🔵 Blue Team' : '🔴 Red Team'}</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] text-gray-400 mr-1">Bans</span>
                              {(game?.matchData?.bannedChampions || []).filter((b: BannedChampion) => b.teamId === teamId).map((ban: BannedChampion) => {
                                const raw = championNameCache[ban.championId] || null;
                                const nice = prettifyChampionName(raw) || '';
                                return (
                                  <div key={`ban-${teamId}-${ban.pickTurn}-${ban.championId}`} className="w-6 h-6 rounded-sm border border-gray-700 overflow-hidden bg-black">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={getChampionIconUrl(ban.championId)}
                                      alt={nice || String(ban.championId)}
                                      title={nice || undefined}
                                      aria-label={nice || undefined}
                                      className="w-full h-full object-cover transform scale-105"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="space-y-1">
                            {teamPlayers.map((p: Participant) => {
                              // Check if this participant is ANY bootcamper (not just the current one)
                              const isBootcamper = inGameBootcampers.some(bc => matchesParticipant(p, bc));

                              // Find the matching bootcamper to get their display name
                              const matchingBootcamper = inGameBootcampers.find(bc => matchesParticipant(p, bc));
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
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={`/positions/${roleImage}`}
                                    alt={p.inferredRole || 'Unknown'}
                                    className="w-5 h-5 flex-shrink-0"
                                    title={p.inferredRole || 'Unknown'}
                                  />
                                  {p.championId && (
                                    (() => {
                                      const raw = p.championName || (p.championId ? championNameCache[p.championId] : null);
                                      const nice = prettifyChampionName(raw) || '';
                                      return (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={getChampionIconUrl(p.championId)}
                                          alt={nice || String(p.championId)}
                                          title={nice || undefined}
                                          aria-label={nice || undefined}
                                          className="w-6 h-6 rounded-full border border-gray-700 bg-black flex-shrink-0 relative"
                                        />
                                      );
                                    })()
                                  )}
                                  <span className="font-medium text-white truncate flex-1">{displayName}</span>
                                  <GameProfileLinks 
                                    riotId={p.riotId || null}
                                    summonerName={p.summonerName || p.riotIdGameName || ''}
                                    size="sm"
                                    className="flex-shrink-0"
                                  />
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                  <div className="flex flex-col items-center gap-1">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={getKeystoneIconUrl(p.perks?.perkIds)} alt="keystone-style" className="w-5 h-5" />
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={getPerkStyleIconUrl(p.perks?.perkSubStyle)} alt="perk-substyle" className="w-4 h-4" />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="flex flex-col items-center gap-1">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={getSummonerSpellIconUrl(p.spell1Id)} alt={`spell-${p.spell1Id}`} className="w-5 h-5" />
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={getSummonerSpellIconUrl(p.spell2Id)} alt={`spell-${p.spell2Id}`} className="w-5 h-5" />
                                    </div>
                                  </div>
                                    {/* Always show an emblem; getRankIconUrl falls back to unranked.png when tier is falsy */}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={getRankIconUrl(p.tier) || ''}
                                      alt={p.tier || 'Unranked'}
                                      className="w-5 h-5"
                                      title={`${p.tier || 'Unranked'} ${p.division || ''}`}
                                    />
                                    <div className="flex items-center gap-2">
                                      {/* Always show an emblem; getRankIconUrl falls back to unranked.png when tier is falsy */}
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={getRankIconUrl(p.tier) || ''} alt={p.tier || 'Unranked'} className="w-5 h-5 object-contain" />
                                      <div className="flex flex-col gap-0">
                                        <div className="flex items-center gap-1">
                                          {(() => {
                                            const rawTier = p.tier || '';
                                            const up = rawTier ? rawTier.toUpperCase() : '';
                                            const tierDisplay = rawTier ? (rawTier.charAt(0) + rawTier.slice(1).toLowerCase()) : (p.rank || 'Unranked');
                                            const isMajor = up === 'MASTER' || up === 'GRANDMASTER' || up === 'CHALLENGER';
                                            return (
                                              <>
                                                <span className={`text-xs font-semibold ${tierColors[up || ''] || 'text-gray-400'}`}>
                                                  {tierDisplay}{!isMajor && p.division ? ` ${p.division}` : ''}
                                                </span>
                                                <span className="text-[11px] text-gray-400">{p.leaguePoints ?? 0} LP</span>
                                              </>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                    </div>
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
