'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import LiveGamesSection from './LiveGamesSection';
import { ListSwitcher } from '@/components/list-switcher';

interface Bootcamper {
  id: string;
  name?: string | null;
  summonerName: string;
  region: string;
  riotId: string | null;
  twitchLogin: string | null;
  role: string | null;
  status: string;
  games: Game[];
  twitchStreams: TwitchStream[];
}

interface Game {
  id: string;
  riotGameId: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  matchData?: {
    participants?: Array<{
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
    }>;
  };
}

interface TwitchStream {
  id: string;
  streamUrl: string;
  live: boolean;
  title: string | null;
  startedAt: string | null;
}

export default function Home() {
  const { data: session } = useSession();
  const [bootcampers, setBootcampers] = useState<Bootcamper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStreamMode, setSelectedStreamMode] = useState<'all' | 'teammates'>('all');
  const [expandedLobby, setExpandedLobby] = useState<{ [id: string]: boolean }>({});
  const [selectedStreamers, setSelectedStreamers] = useState<string[]>([]); // Array of bootcamper IDs
  
  // Set initial list based on user permissions
  // Regular users start with 'user', admins start with 'default'
  const getInitialList = (): 'default' | 'user' => {
    if (!session?.user) return 'default';
    return session.user.isAdmin ? 'default' : 'user';
  };
  
  const [currentList, setCurrentList] = useState<'default' | 'user'>(getInitialList());

  // Update currentList when session changes
  useEffect(() => {
    if (session?.user) {
      const newList = session.user.isAdmin ? 'default' : 'user';
      setCurrentList(newList);
    }
  }, [session?.user]);

  const fetchData = useCallback(async () => {
    try {
      const listType = session?.user ? currentList : 'default';
      const response = await fetch(`/api/bootcampers?listType=${listType}`);
      const data = await response.json();
      setBootcampers(data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [session?.user, currentList]);

  useEffect(() => {
    fetchData();
    // Refresh data every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]); // Re-fetch when fetchData changes

  const liveStreamers = bootcampers.filter(
    (b) => b.twitchStreams && b.twitchStreams.length > 0 && b.twitchStreams[0].live
  );

  const inGameBootcampers = bootcampers.filter((b) => b.status === 'in_game');

  // Group bootcampers by game ID to find teammates
  const findTeammates = () => {
    const gameGroups: { [gameId: string]: Bootcamper[] } = {};
    
    inGameBootcampers.forEach(bootcamper => {
      // Get the most recent game if they have games
      const recentGame = bootcamper.games?.[0];
      if (recentGame && recentGame.status === 'in_progress') {
        if (!gameGroups[recentGame.riotGameId]) {
          gameGroups[recentGame.riotGameId] = [];
        }
        gameGroups[recentGame.riotGameId].push(bootcamper);
      }
    });

    // Find teammates who are also streaming
    const teammates = Object.values(gameGroups)
      .filter(group => group.length > 1) // More than 1 player in same game
      .find(group => 
        group.filter(b => 
          b.twitchStreams && 
          b.twitchStreams.length > 0 && 
          b.twitchStreams[0].live
        ).length > 1 // More than 1 player streaming in same game
      );

    return teammates?.filter(b => 
      b.twitchStreams && 
      b.twitchStreams.length > 0 && 
      b.twitchStreams[0].live
    ) || [];
  };

  const teammateStreamers = findTeammates();
  const displayStreamers = selectedStreamMode === 'teammates' && teammateStreamers.length > 1 
    ? teammateStreamers 
    : liveStreamers;

  // Manage selected streams for multi-view (max 4)
  const selectedStreams = selectedStreamers
    .map(id => displayStreamers.find(s => s.id === id))
    .filter((s): s is Bootcamper => s !== undefined)
    .slice(0, 4);

  const streamsToShow = selectedStreams.length > 0 ? selectedStreams : displayStreamers.slice(0, 4);

  const toggleStreamerSelection = (id: string) => {
    setSelectedStreamers(prev => {
      if (prev.includes(id)) {
        return prev.filter(sid => sid !== id);
      } else if (prev.length < 4) {
        return [...prev, id];
      }
      return prev;
    });
  };

  // Generate Twitch embed URLs
  const getTwitchEmbedUrl = (twitchLogin: string) => {
    // Extract hostname and port from NEXT_PUBLIC_APP_URL or use current location
    const getParentDomains = () => {
      const domains = [];
      
      if (typeof window !== 'undefined') {
        // Client-side: use current location
        const { hostname, port } = window.location;
        domains.push(hostname);
        if (port && port !== '80' && port !== '443') {
          domains.push(`${hostname}:${port}`);
        }
      } else {
        // Server-side: extract from NEXT_PUBLIC_APP_URL
        const appUrl = process.env.NEXT_PUBLIC_APP_URL;
        if (appUrl) {
          try {
            const url = new URL(appUrl);
            domains.push(url.hostname);
            const isStandardPort = (url.protocol === 'https:' && url.port === '443') || 
                                  (url.protocol === 'http:' && url.port === '80') || 
                                  !url.port;
            if (!isStandardPort) {
              domains.push(`${url.hostname}:${url.port}`);
            }
          } catch {
            domains.push('localhost');
          }
        } else {
          domains.push('localhost');
        }
      }
      
      return [...new Set(domains)]; // Remove duplicates
    };

    const parentDomains = getParentDomains();
    const parentParams = parentDomains.map(domain => `parent=${domain}`).join('&');
    
    return `https://player.twitch.tv/?channel=${twitchLogin}&${parentParams}&autoplay=false`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-in">
          <div className="text-center flex-1 space-y-4">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              Korean Bootcamp
            </h1>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Real-time tracking of League of Legends players during their Korean soloq journey
            </p>
          </div>
          {session?.user && (
            <div className="flex-shrink-0">
              <ListSwitcher currentList={currentList} onSwitch={setCurrentList} />
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
          <div className="card-modern p-6 text-center group">
            <div className="text-3xl font-bold text-white mb-2">
              {bootcampers.length}
            </div>
            <div className="text-sm text-gray-400 mb-1">Total Bootcampers</div>
            <div className="h-1 w-12 mx-auto bg-gradient-to-r from-blue-500 to-purple-600 rounded-full opacity-60 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="card-modern p-6 text-center group">
            <div className="text-3xl font-bold text-white mb-2 flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              {liveStreamers.length}
            </div>
            <div className="text-sm text-gray-400 mb-1">Live Streams</div>
            <div className="h-1 w-12 mx-auto bg-gradient-to-r from-red-500 to-pink-600 rounded-full opacity-60 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="card-modern p-6 text-center group">
            <div className="text-3xl font-bold text-white mb-2 flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              {inGameBootcampers.length}
            </div>
            <div className="text-sm text-gray-400 mb-1">In Game</div>
            <div className="h-1 w-12 mx-auto bg-gradient-to-r from-green-500 to-emerald-600 rounded-full opacity-60 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Multistream Embed */}
          <div className="lg:col-span-2 card-modern p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Live Streams</h2>
              <div className="flex items-center gap-4">
                {teammateStreamers.length > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedStreamMode(selectedStreamMode === 'all' ? 'teammates' : 'all')}
                      className={`px-3 py-1 text-xs rounded-full transition-all ${
                        selectedStreamMode === 'teammates'
                          ? 'bg-purple-500 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {selectedStreamMode === 'teammates' ? 'Teammates' : 'All Streams'}
                    </button>
                  </div>
                )}
                {displayStreamers.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    {displayStreamers.length} live
                  </div>
                )}
              </div>
            </div>

            {/* Stream Selector - Show if more than 4 streams */}
            {displayStreamers.length > 4 && (
              <div className="mb-4 p-3 bg-gray-900/50 rounded-lg border border-gray-800">
                <p className="text-xs text-gray-400 mb-2">
                  Select up to 4 streams to view ({selectedStreamers.length}/4 selected)
                </p>
                <div className="flex flex-wrap gap-2">
                  {displayStreamers.map((streamer) => (
                    <button
                      key={streamer.id}
                      onClick={() => toggleStreamerSelection(streamer.id)}
                      className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                        selectedStreamers.includes(streamer.id)
                          ? 'bg-purple-500 text-white ring-2 ring-purple-400'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      } ${
                        !selectedStreamers.includes(streamer.id) && selectedStreamers.length >= 4
                          ? 'opacity-50 cursor-not-allowed'
                          : ''
                      }`}
                      disabled={!selectedStreamers.includes(streamer.id) && selectedStreamers.length >= 4}
                    >
                      {streamer.name || streamer.summonerName}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {displayStreamers.length > 0 ? (
              <>
                {/* Dynamic layouts based on stream count */}
                <div className={`grid gap-3 ${
                  streamsToShow.length === 1 ? 'grid-cols-1' :
                  streamsToShow.length === 2 ? 'grid-cols-2' :
                  streamsToShow.length === 3 ? 'grid-cols-2' : // 2 on top, 1 on bottom
                  'grid-cols-2' // 4 streams in 2x2
                }`}>
                  {streamsToShow.map((streamer, index) => (
                    <div 
                      key={streamer.id} 
                      className={`${
                        streamsToShow.length === 1 ? 'col-span-1 aspect-video' :
                        streamsToShow.length === 2 ? 'col-span-1 aspect-video' :
                        streamsToShow.length === 3 && index === 2 ? 'col-span-2 aspect-[2/1]' : // Wide bottom stream for 3-stream
                        'col-span-1 aspect-video'
                      } bg-gray-900 rounded-xl overflow-hidden relative group ring-1 ring-gray-800 hover:ring-purple-500/50 transition-all`}
                    >
                      <iframe
                        src={getTwitchEmbedUrl(streamer.twitchLogin!)}
                        width="100%"
                        height="100%"
                        frameBorder="0"
                        allowFullScreen
                        className="w-full h-full"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">
                              {streamer.name || streamer.summonerName}
                            </p>
                            {streamer.twitchStreams[0]?.title && (
                              <p className="text-gray-300 text-xs truncate mt-1">
                                {streamer.twitchStreams[0].title}
                              </p>
                            )}
                          </div>
                          {selectedStreamMode === 'teammates' && (
                            <span className="ml-2 bg-purple-500/90 text-white text-xs px-2 py-1 rounded-full whitespace-nowrap">
                              Same Game
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {displayStreamers.length > 4 && selectedStreamers.length === 0 && (
                  <div className="mt-3 text-center">
                    <p className="text-xs text-gray-500">
                      Showing first 4 of {displayStreamers.length} streams. Select specific streams above to customize your view.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="aspect-video bg-gray-900/50 rounded-xl border border-dashed border-gray-700 flex flex-col items-center justify-center">
                <div className="text-gray-500 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-800 flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.55-2.3a1 1 0 011.45.9v6.8a1 1 0 01-1.45.9L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm">
                    {selectedStreamMode === 'teammates' 
                      ? 'No teammates streaming together' 
                      : 'No live streams'
                    }
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {selectedStreamMode === 'teammates'
                      ? 'Teammate streams will appear when bootcampers are in the same game'
                      : 'Streams will appear here when bootcampers go live'
                    }
                  </p>
                </div>
              </div>
            )}
            {liveStreamers.length > 4 && (
              <div className="mt-4 text-center">
                <p className="text-xs text-gray-500">
                  Showing 3 of {liveStreamers.length} live streams
                </p>
              </div>
            )}
          </div>

          {/* Live Games */}
          <div className="card-modern p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">Live Games</h2>
              {inGameBootcampers.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  {inGameBootcampers.length} in game
                </div>
              )}
            </div>
            <LiveGamesSection
              inGameBootcampers={inGameBootcampers}
              expandedLobby={expandedLobby}
              onToggleLobby={id => setExpandedLobby(prev => ({ ...prev, [id]: !prev[id] }))}
            />
          </div>
        </div>

        {/* All Bootcampers */}
        <div className="card-modern p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white">All Bootcampers</h2>
            <div className="text-sm text-gray-400">
              {bootcampers.length} total
            </div>
          </div>
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="bg-gray-900 border border-gray-800">
              <TabsTrigger value="all" className="data-[state=active]:bg-gray-800">All</TabsTrigger>
              <TabsTrigger value="live" className="data-[state=active]:bg-gray-800">Live</TabsTrigger>
              <TabsTrigger value="streaming" className="data-[state=active]:bg-gray-800">Streaming</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {bootcampers.map((bootcamper) => (
                  <BootcamperCard key={bootcamper.id} bootcamper={bootcamper} />
                ))}
              </div>
            </TabsContent>
            <TabsContent value="live" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {inGameBootcampers.map((bootcamper) => (
                  <BootcamperCard key={bootcamper.id} bootcamper={bootcamper} />
                ))}
              </div>
            </TabsContent>
            <TabsContent value="streaming" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {liveStreamers.map((bootcamper) => (
                  <BootcamperCard key={bootcamper.id} bootcamper={bootcamper} />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function BootcamperCard({ bootcamper }: { bootcamper: Bootcamper }) {
  const isLive = bootcamper.status === 'in_game';
  const isStreaming =
    bootcamper.twitchStreams &&
    bootcamper.twitchStreams.length > 0 &&
    bootcamper.twitchStreams[0].live;

  const getOpGgUrl = (summonerName: string, region: string, riotId: string | null) => {
    let nameWithTag = summonerName;
    
    // If riotId exists and contains a tag, append it to the name
    if (riotId && riotId.includes('#')) {
      const [gameName, tag] = riotId.split('#');
      nameWithTag = `${gameName}-${tag}`;
    }
    
    const cleanName = encodeURIComponent(nameWithTag.replace(/\s+/g, ''));
    return `https://op.gg/summoners/${region}/${cleanName}`;
  };

  const getDeeplolUrl = (riotId: string | null, summonerName: string, region: string) => {
    // DeepLoL uses format: https://www.deeplol.gg/summoner/kr/gameName-tagLine
    let nameWithTag = summonerName;
    
    if (riotId && riotId.includes('#')) {
      const [gameName, tag] = riotId.split('#');
      nameWithTag = `${gameName}-${tag}`;
    }
    
    const cleanName = encodeURIComponent(nameWithTag.replace(/\s+/g, ''));
    return `https://www.deeplol.gg/summoner/${region}/${cleanName}`;
  };

  return (
    <div className="group p-4 bg-gray-900/50 rounded-xl border border-gray-800 hover:border-gray-700 hover:bg-gray-900/70 transition-all duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-white truncate">
              {bootcamper.name || bootcamper.summonerName}
            </h3>
            <div className="flex items-center gap-1 flex-shrink-0">
              <a
                href={getOpGgUrl(bootcamper.summonerName, bootcamper.region, bootcamper.riotId)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80 transition-opacity"
                title="View on OP.GG"
              >
                <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                  <text x="2" y="18" fontSize="16" fontWeight="bold" fontFamily="Arial">OP</text>
                </svg>
              </a>
              <a
                href={getDeeplolUrl(bootcamper.riotId, bootcamper.summonerName, bootcamper.region)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80 transition-opacity"
                title="View on DeepLoL"
              >
                <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
                  <text x="1" y="18" fontSize="14" fontWeight="bold" fontFamily="Arial">DL</text>
                </svg>
              </a>
            </div>
          </div>
          {bootcamper.name && (
            <p className="text-xs text-gray-500">
              {bootcamper.summonerName}
            </p>
          )}
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            {bootcamper.region}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          {isLive && (
            <div className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Game
            </div>
          )}
          {isStreaming && (
            <div className="flex items-center gap-1 text-xs text-purple-400 bg-purple-500/10 px-2 py-1 rounded-full">
              <div className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" />
              Live
            </div>
          )}
        </div>
      </div>
      
      {bootcamper.role && (
        <div className="mb-2">
          <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-gray-800 text-gray-300 rounded-md">
            {bootcamper.role}
          </span>
        </div>
      )}
      
      {bootcamper.twitchLogin && (
        <a
          href={`https://www.twitch.tv/${bootcamper.twitchLogin}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-purple-400 transition-colors"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
          </svg>
          {bootcamper.twitchLogin}
        </a>
      )}
    </div>
  );
}
