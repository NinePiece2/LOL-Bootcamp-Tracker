'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Modal } from '@/components/ui/modal';
import LiveGamesSection from './LiveGamesSection';
import { ListSwitcher } from '@/components/list-switcher';
import { Eye, EyeOff, GripVertical, X } from 'lucide-react';

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
  const [showLobbyModal, setShowLobbyModal] = useState(false);
  const [selectedLobbyId, setSelectedLobbyId] = useState<string | null>(null);
  const [selectedStreamers, setSelectedStreamers] = useState<string[]>([]); // Array of bootcamper IDs for ordering
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [explicitSelection, setExplicitSelection] = useState(false);
  
  // Set initial list based on localStorage or user permissions
  const getInitialList = (): 'default' | 'user' => {
    // Try to get from localStorage first (client-side only)
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('bootcamp-list-preference');
      if (stored === 'default' || stored === 'user') {
        return stored;
      }
    }
    // Fall back to user permissions
    if (!session?.user) return 'default';
    return session.user.isAdmin ? 'default' : 'user';
  };
  
  const [currentList, setCurrentList] = useState<'default' | 'user'>(getInitialList());

  // Update currentList when session changes (only if no stored preference)
  useEffect(() => {
    if (session?.user && typeof window !== 'undefined') {
      const stored = localStorage.getItem('bootcamp-list-preference');
      if (!stored) {
        const newList = session.user.isAdmin ? 'default' : 'user';
        setCurrentList(newList);
      }
    }
  }, [session?.user]);

  // Persist list selection to localStorage and sync across tabs
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('bootcamp-list-preference', currentList);
      
      // Broadcast change to other tabs/windows
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'bootcamp-list-preference',
        newValue: currentList,
      }));
    }
  }, [currentList]);

  // Listen for changes from other tabs/windows
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'bootcamp-list-preference' && (e.newValue === 'default' || e.newValue === 'user')) {
        setCurrentList(e.newValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

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

  // Load saved layout for authenticated users
  useEffect(() => {
    if (!session?.user) return;

    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/user/layout');
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted || !data) return;
        if (data.selectedStreamers && Array.isArray(data.selectedStreamers)) {
          setSelectedStreamers(data.selectedStreamers.slice(0, 4));
          setExplicitSelection(true);
        }
      } catch (err) {
        console.error('Failed to load user layout', err);
      }
    })();

    return () => { mounted = false; };
  }, [session?.user]);

  // Persist layout for authenticated users when selection changes (debounced)
  useEffect(() => {
    if (!session?.user) return;
    const payload = { selectedStreamers, explicitSelection };
    const id = setTimeout(async () => {
      try {
        await fetch('/api/user/layout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.error('Failed to save user layout', err);
      }
    }, 500);

    return () => clearTimeout(id);
  }, [session?.user, selectedStreamers, explicitSelection]);

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

  // If the user has explicitly interacted with selection controls, we honor selectedStreamers
  // (which can be empty, resulting in a blank canvas). Otherwise we fall back to showing
  // the default displayStreamers (up to 4).
  let streamsToShow: Bootcamper[];
  if (explicitSelection) {
    streamsToShow = selectedStreams; // may be empty (blank canvas)
  } else {
    streamsToShow = selectedStreams.length > 0 ? selectedStreams : displayStreamers.slice(0, 4);
  }

  const toggleStreamerSelection = (id: string) => {
    setExplicitSelection(true);
    setSelectedStreamers(prev => {
      if (prev.includes(id)) {
        return prev.filter(sid => sid !== id);
      } else if (prev.length < 4) {
        return [...prev, id];
      }
      return prev;
    });
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    // Required by some browsers to allow drag to start
    try {
      e.dataTransfer?.setData('text/plain', String(index));
      e.dataTransfer!.effectAllowed = 'move';
    } catch {
      // ignore
    }
    setDraggedIndex(index);
  };

  // Note: Bootcamper cards set 'text/bootcamper' on dragStart themselves.

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    // Only reorder when there is an active dragged index
    if (draggedIndex === null || draggedIndex === index) return;

    // selectedStreamers holds ids in the order user selected them. When streamsToShow
    // is backed by selectedStreams (user has selection), indices align. Otherwise
    // we don't support reordering.
    if (selectedStreamers.length === 0) return;

    const newOrder = [...selectedStreamers];
    const draggedId = newOrder[draggedIndex];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(index, 0, draggedId);

    setSelectedStreamers(newOrder);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleAddToggle = (bootcamper: Bootcamper) => {
    // Only allow adding if the bootcamper is currently streaming live
    const isStreaming = !!(bootcamper.twitchStreams && bootcamper.twitchStreams.length > 0 && bootcamper.twitchStreams[0].live);
    // If it's not streaming and not currently selected, ignore (can't add)
    if (!isStreaming && !selectedStreamers.includes(bootcamper.id)) return;
    // If this is a default-displayed streamer (no explicit selection yet) and the
    // id is not in selectedStreamers, we want to switch to explicit selection mode
    // and initialize selectedStreamers to the currently visible streams minus this id.
    if (!explicitSelection && !selectedStreamers.includes(bootcamper.id) && streamsToShow.some(s => s.id === bootcamper.id)) {
      const initial = streamsToShow.map(s => s.id).filter(id => id !== bootcamper.id).slice(0, 4);
      setExplicitSelection(true);
      setSelectedStreamers(initial);
      return;
    }

    setExplicitSelection(true);
    setSelectedStreamers(prev => {
      if (prev.includes(bootcamper.id)) {
        return prev.filter(s => s !== bootcamper.id);
      }
      if (prev.length >= 4) return prev;
      return [...prev, bootcamper.id];
    });
  };

  const removeStream = (id: string) => {
    if (!explicitSelection) {
      // switch to explicit and initialize to streamsToShow minus id
      const initial = streamsToShow.map(s => s.id).filter(sid => sid !== id).slice(0, 4);
      setExplicitSelection(true);
      setSelectedStreamers(initial);
      return;
    }

    setSelectedStreamers(prev => prev.filter(s => s !== id));
  };

  // Handle drop from external source (bootcamper list) or internal drops
  const handleDrop = (e: React.DragEvent, index?: number) => {
    e.preventDefault();
    // External drop (new bootcamper id)
    const bootcamperId = e.dataTransfer?.getData('text/bootcamper');
    if (bootcamperId) {
      // Ensure this bootcamper is currently a live streamer
      const candidate = liveStreamers.find(s => s.id === bootcamperId);
      if (!candidate || !candidate.twitchStreams || candidate.twitchStreams.length === 0 || !candidate.twitchStreams[0].live) {
        setDraggedIndex(null);
        return;
      }
      // If already selected, ignore
      if (selectedStreamers.includes(bootcamperId)) {
        setDraggedIndex(null);
        return;
      }

      if (selectedStreamers.length >= 4) {
        // max reached
        setDraggedIndex(null);
        return;
      }

  setExplicitSelection(true);
  const newOrder = [...selectedStreamers];
      if (typeof index === 'number') {
        newOrder.splice(index, 0, bootcamperId);
      } else {
        newOrder.push(bootcamperId);
      }
      setSelectedStreamers(newOrder);
      setDraggedIndex(null);
      return;
    }

    // If internal move (we already handle reorder on dragOver), just clear
    setDraggedIndex(null);
  };

  // clearSelection removed — clearing is handled via explicit selection controls or removeStream

  const handleLobbyClick = (bootcamperId: string) => {
    setSelectedLobbyId(bootcamperId);
    setShowLobbyModal(true);
  };

  // Generate Twitch embed URLs
  const getTwitchEmbedUrl = (twitchLogin: string) => {
    // For local development prefer parent=localhost (no port) to avoid Twitch
    // rejecting the colon in host:port combinations. For production we include
    // the configured NEXT_PUBLIC_APP_URL host (and port if non-standard).
    const parentDomains: string[] = [];

    if (typeof window !== 'undefined') {
      const { hostname } = window.location;
      // If running on localhost or 127.0.0.1, use hostname only (no port)
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        parentDomains.push(hostname);
      } else {
        // Use hostname, and also include host:port only if port is standardly required
        const { port } = window.location;
        parentDomains.push(hostname);
        if (port && port !== '80' && port !== '443') {
          parentDomains.push(`${hostname}:${port}`);
        }
      }
    } else {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (appUrl) {
        try {
          const url = new URL(appUrl);
          parentDomains.push(url.hostname);
          if (url.port && url.port !== '80' && url.port !== '443') {
            parentDomains.push(`${url.hostname}:${url.port}`);
          }
        } catch {
          parentDomains.push('lol-bootcamp-tracker.romitsagu.com');
        }
      } else {
        parentDomains.push('lol-bootcamp-tracker.romitsagu.com');
      }
    }

    // Ensure localhost is included for developer testing
    if (!parentDomains.includes('localhost')) parentDomains.push('localhost');
    if (!parentDomains.includes('127.0.0.1')) parentDomains.push('127.0.0.1');

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
            <div className="h-1 w-12 mx-auto bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full opacity-60 group-hover:opacity-100 transition-opacity" />
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
                {/* Stream Control Toolbar removed — simplified UX */}

                {/* Dynamic layouts based on stream count */}
                <div className={`grid gap-3 ${
                  streamsToShow.length === 1 ? 'grid-cols-1' :
                  streamsToShow.length === 2 ? 'grid-cols-2' :
                  streamsToShow.length === 3 ? 'grid-cols-2' : // 2 on top, 1 on bottom
                  'grid-cols-2' // 4 streams in 2x2
                }`}>
                  {streamsToShow.length === 0 && (
                    <div className="col-span-2 aspect-[16/9] rounded-xl bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center text-center p-8">
                      <div className="max-w-xl">
                        <h2 className="text-2xl font-semibold text-gray-100 mb-2">No streams selected</h2>
                        <p className="text-gray-400">Click &quot;Add&quot; on a bootcamper, or drag a live bootcamper here to start watching. You can also clear selections to see a blank canvas.</p>
                      </div>
                    </div>
                  )}
                  {streamsToShow.map((streamer, index) => (
                    <div
                      key={streamer.id}
                      draggable={selectedStreamers.length > 0}
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={() => handleDragEnd()}
                      onDrop={(e) => handleDrop(e, index)}
                      className={`${
                        streamsToShow.length === 1 ? 'col-span-1 aspect-video' :
                        streamsToShow.length === 2 ? 'col-span-1 aspect-video' :
                        streamsToShow.length === 3 && index === 2 ? 'col-span-2 aspect-[2/1]' : // Wide bottom stream for 3-stream
                        'col-span-1 aspect-video'
                      } bg-gray-900 rounded-xl overflow-hidden relative group ring-1 ring-gray-800 hover:ring-purple-500/50 transform-gpu will-change-transform transition-transform duration-200 ease-in-out ${
                        draggedIndex === index ? 'opacity-50 scale-95' : ''
                      } ${selectedStreamers.length > 0 ? 'cursor-move' : ''}`}
                    >
                      {/* Selection Toggle Overlay */}
                      <div className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStreamerSelection(streamer.id);
                          }}
                          className={`p-2 rounded-lg backdrop-blur-sm transition-all ${
                            selectedStreamers.includes(streamer.id)
                              ? 'bg-purple-500 text-white ring-2 ring-purple-400'
                              : 'bg-black/50 text-gray-300 hover:bg-black/70'
                          }`}
                          title={selectedStreamers.includes(streamer.id) ? 'Deselect stream' : 'Select stream'}
                        >
                          {selectedStreamers.includes(streamer.id) ? (
                            <Eye className="w-4 h-4" />
                          ) : (
                            <EyeOff className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {/* Visible Drag Handle + Close Button */}
                      <div className="absolute top-2 left-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                        <div
                          onMouseDown={() => { if (selectedStreamers.length > 0) setDraggedIndex(index); }}
                          className={`p-2 bg-black/60 backdrop-blur-sm rounded-lg text-gray-200 ${selectedStreamers.length === 0 ? 'opacity-90' : 'opacity-100'}`}
                          title="Drag to reorder"
                        >
                          <GripVertical className="w-4 h-4" />
                        </div>
                      </div>

                      <div className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Remove this streamer respecting explicitSelection
                            removeStream(streamer.id);
                          }}
                          title="Close stream"
                          className="p-2 bg-black/60 backdrop-blur-sm rounded-lg text-gray-200 hover:bg-red-600/80"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <iframe
                        src={getTwitchEmbedUrl(streamer.twitchLogin!)}
                        width="100%"
                        height="100%"
                        frameBorder="0"
                        allowFullScreen
                        className="w-full h-full"
                        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
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
              onLobbyClick={handleLobbyClick}
            />
          </div>
        </div>

        {/* Lobby Modal */}
        <Modal
          isOpen={showLobbyModal}
          onClose={() => {
            setShowLobbyModal(false);
            setSelectedLobbyId(null);
          }}
          title="Game Lobby Details"
          maxWidth="6xl"
        >
          {selectedLobbyId && (
            <div className="space-y-4">
              <LiveGamesSection
                inGameBootcampers={inGameBootcampers.filter(bc => bc.id === selectedLobbyId)}
                expandedByDefault={true}
              />
            </div>
          )}
        </Modal>

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
              <TabsTrigger value="all" className="data-[state=active]:bg-gray-800 cursor-pointer">All</TabsTrigger>
              <TabsTrigger value="live" className="data-[state=active]:bg-gray-800 cursor-pointer">Live</TabsTrigger>
              <TabsTrigger value="streaming" className="data-[state=active]:bg-gray-800 cursor-pointer">Streaming</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {bootcampers.map((bootcamper) => (
                  <BootcamperCard
                    key={bootcamper.id}
                    bootcamper={bootcamper}
                    onAdd={() => handleAddToggle(bootcamper)}
                    isSelected={
                      selectedStreamers.includes(bootcamper.id) ||
                      (selectedStreamers.length === 0 && streamsToShow.some(s => s.id === bootcamper.id))
                    }
                    canAdd={selectedStreamers.length < 4}
                  />
                ))}
              </div>
            </TabsContent>
            <TabsContent value="live" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {inGameBootcampers.map((bootcamper) => (
                  <BootcamperCard
                    key={bootcamper.id}
                    bootcamper={bootcamper}
                    onAdd={() => handleAddToggle(bootcamper)}
                    isSelected={
                      selectedStreamers.includes(bootcamper.id) ||
                      (selectedStreamers.length === 0 && streamsToShow.some(s => s.id === bootcamper.id))
                    }
                    canAdd={selectedStreamers.length < 4}
                  />
                ))}
              </div>
            </TabsContent>
            <TabsContent value="streaming" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {liveStreamers.map((bootcamper) => (
                  <BootcamperCard
                    key={bootcamper.id}
                    bootcamper={bootcamper}
                    onAdd={() => handleAddToggle(bootcamper)}
                    isSelected={
                      selectedStreamers.includes(bootcamper.id) ||
                      (selectedStreamers.length === 0 && streamsToShow.some(s => s.id === bootcamper.id))
                    }
                    canAdd={selectedStreamers.length < 4}
                  />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function BootcamperCard({ bootcamper, onAdd, isSelected, canAdd }: { bootcamper: Bootcamper; onAdd?: (id: string) => void; isSelected?: boolean; canAdd?: boolean }) {
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

  const getDpmlolUrl = (riotId: string | null, summonerName: string, region: string) => {
    // DPMLoL uses format: https://www.dpm.lol/gameName%20-tag
    let nameWithTag = summonerName;
    
    if (riotId && riotId.includes('#')) {
      const [gameName, tag] = riotId.split('#');
      nameWithTag = `${gameName} -${tag}`;
    }
    
    const cleanName = encodeURIComponent(nameWithTag);
    return `https://dpm.lol/${cleanName}`;
  };


  const handleDragStartLocal = (e: React.DragEvent) => {
    if (!isStreaming) return;
    try {
      e.dataTransfer?.setData('text/bootcamper', bootcamper.id);
      e.dataTransfer!.effectAllowed = 'copy';
    } catch {
      // ignore
    }
  };

  return (
    <div
      draggable={isStreaming}
      onDragStart={handleDragStartLocal}
      className="group p-4 bg-gray-900/50 rounded-xl border border-gray-800 hover:border-gray-700 hover:bg-gray-900/70 transition-all duration-200"
    >
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
                href={getDpmlolUrl(bootcamper.riotId, bootcamper.summonerName, bootcamper.region)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80 transition-opacity"
                title="View on DPMLoL"
              >
                <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
                  <text x="-1" y="18" fontSize="11" fontWeight="bold" fontFamily="Arial">DPM</text>
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
      {/* Add / Remove control for quick add to dashboard */}
      <div className="mt-3 flex items-center gap-2">
  {onAdd && (isStreaming || isSelected) && (
          <button
            type="button"
            onClick={() => onAdd(bootcamper.id)}
            disabled={canAdd === false && !isSelected}
            className={`inline-flex items-center gap-2 px-2 py-1 text-xs rounded-md transition-colors ${isSelected ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            title={isSelected ? 'Remove from dashboard' : 'Add to dashboard'}
          >
            {isSelected ? (
              <>
                <X className="w-3 h-3" />
                Remove
              </>
            ) : (
              <>
                <GripVertical className="w-3 h-3" />
                Add
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
