'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Modal } from '@/components/ui/modal';
import LiveGamesSection from './LiveGamesSection';
import { ListSwitcher } from '@/components/list-switcher';
import { GameProfileLinks } from '@/components/game-profile-links';
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
  // dragging state: which stream id is being dragged, and where it would drop
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // When dragging an external bootcamper from the Bootcampers list, track active state
  const [externalDragActive, setExternalDragActive] = useState(false);
  const [explicitSelection, setExplicitSelection] = useState(false);
  // Floating preview while dragging
  const [previewStreamer, setPreviewStreamer] = useState<Bootcamper | null>(null);
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number } | null>(null);
  
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

  // Keep a ref copy so window-level handlers can access latest list without
  // needing to be re-registered on every change.
  const liveStreamersRef = useRef<Bootcamper[]>([]);
  useEffect(() => { liveStreamersRef.current = liveStreamers; }, [liveStreamers]);

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

  // Helper to render placeholder slot when dragging
  const renderPlaceholder = (idx: number) => (
    <div key={`placeholder-${idx}`} className="col-span-1 aspect-video rounded-xl border-2 border-dashed border-purple-500/60 bg-gradient-to-b from-black/70 to-transparent animate-fade-in flex items-center justify-center p-4">
      <div className="text-sm text-purple-300">Drop here</div>
    </div>
  );

  // Grid ref to compute drop positions reliably (works around iframe capturing events)
  const streamGridRef = useRef<HTMLDivElement | null>(null);
  // Refs for callbacks used by window-level drag handlers to avoid referencing
  // functions before they're declared (prevents initialization order issues).
  const computeDropRef = useRef<((x: number) => number) | null>(null);
  const addExternalRef = useRef<((id: string, idx?: number) => boolean) | null>(null);
  // Portal element for rendering the floating preview at the document body level
  const previewPortalElRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.createElement('div');
    previewPortalElRef.current = el;
    document.body.appendChild(el);
    return () => {
      if (previewPortalElRef.current) {
        try { document.body.removeChild(previewPortalElRef.current); } catch {}
        previewPortalElRef.current = null;
      }
    };
  }, []);

  

  // Compute drop index based on pointer X within the grid container
  // Slot-based approach: divide the container into (N + 1) equal slots (before/between/after tiles)
  const computeDropIndexFromX = useCallback((clientX: number) => {
    const container = streamGridRef.current;
    if (!container) return 0;

    // Find visible stream tiles (they have data-stream-id). We rely on
    // the rendered DOM order to reflect the visual order (including
    // cases where one tile spans multiple columns). Using element
    // center X positions and midpoints between centers gives stable
    // slot boundaries that match visual layout.
    const children = Array.from(container.querySelectorAll('[data-stream-id]')) as HTMLElement[];
  const itemCount = Math.max(0, children.length);

    // If no items, there's only slot 0
    if (itemCount === 0) return 0;

    // Compute center X of each child in document coordinates
    const centers = children.map((el) => {
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2;
    });

    // If there's only one item, decide before/after based on center
    if (centers.length === 1) {
      return clientX < centers[0] ? 0 : 1;
    }

    // Compute midpoints between adjacent centers to split the horizontal
    // space into (N + 1) slots. If clientX is left of the first midpoint
    // it's slot 0, between midpoints it's slot i+1, otherwise slot N.
    for (let i = 0; i < centers.length - 1; i++) {
      const mid = (centers[i] + centers[i + 1]) / 2;
      if (clientX < mid) return i + 1;
    }

    // After the last midpoint -> insert at end
    return centers.length;
  }, [streamGridRef]);

  // keep ref updated so window listeners can call this safely
  useEffect(() => { computeDropRef.current = computeDropIndexFromX; }, [computeDropIndexFromX]);

  // Finalize an internal reorder (used by overlay pointerup or drop)
  const finalizeInternalReorder = (targetIndex?: number) => {
    if (!draggedId) return;
    if (selectedStreamers.length === 0) {
      setDraggedId(null);
      setDropIndex(null);
      setIsDragging(false);
      return;
    }

    const currentOrder = [...selectedStreamers];
    const existingIndex = currentOrder.indexOf(draggedId);
    if (existingIndex === -1) {
      setDraggedId(null);
      setDropIndex(null);
      setIsDragging(false);
      return;
    }

    currentOrder.splice(existingIndex, 1);
    let insertAt = typeof targetIndex === 'number' ? targetIndex : (dropIndex ?? currentOrder.length);
    if (existingIndex < insertAt) insertAt = Math.max(0, insertAt);
    if (insertAt > currentOrder.length) insertAt = currentOrder.length;
    currentOrder.splice(insertAt, 0, draggedId);
    setSelectedStreamers(currentOrder);

    setDraggedId(null);
    setDropIndex(null);
    setIsDragging(false);
    setPreviewStreamer(null);
    setPreviewPos(null);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number, id: string) => {
    // start an internal drag of an already-selected stream
    try {
      // store a hint for external listeners if any
      e.dataTransfer?.setData('text/plain', id);
      e.dataTransfer!.effectAllowed = 'move';
    } catch {
      // ignore
    }
    // If user hasn't explicitly selected streams yet, initialize from current view
    if (selectedStreamers.length === 0) {
      const initial = streamsToShow.map(s => s.id).slice(0, 4);
      setSelectedStreamers(initial);
      setExplicitSelection(true);
    }
    setDraggedId(id);
    setDropIndex(index);
    setIsDragging(true);
    // set preview streamer if possible
    const s = streamsToShow.find(s => s.id === id);
    if (s) setPreviewStreamer(s);
    // Set initial preview position near the pointer when drag starts
    try {
      const x = (e as React.DragEvent).clientX;
      const y = (e as React.DragEvent).clientY;
      // bring preview closer to cursor for more precise dragging
      setPreviewPos({ x: x + 6, y: y + 6 });
    } catch {}
  };

  // Helper to start drag from non-drag events (mouse down / touchstart)
  const startDrag = (id: string, index: number, coords?: { x: number; y: number } | null) => {
    if (selectedStreamers.length === 0) {
      const initial = streamsToShow.map(s => s.id).slice(0, 4);
      setSelectedStreamers(initial);
      setExplicitSelection(true);
    }
    setDraggedId(id);
    setDropIndex(index);
    setIsDragging(true);
    const s = streamsToShow.find(s => s.id === id);
    if (s) setPreviewStreamer(s);
    if (coords) setPreviewPos({ x: coords.x + 6, y: coords.y + 6 });
  };

  // Note: Bootcamper cards set 'text/bootcamper' on dragStart themselves.

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    // Only show possible drop positions when dragging a selected stream
    if (!isDragging || !draggedId) return;
    // prevent noop
    if (dropIndex === index) return;
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    setDropIndex(index);
    try {
      setPreviewPos({ x: e.clientX + 6, y: e.clientY + 6 });
    } catch {}
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDropIndex(null);
    setIsDragging(false);
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
        setDraggedId(null);
        setDropIndex(null);
        setIsDragging(false);
        return;
      }
      // If already selected, ignore
      if (selectedStreamers.includes(bootcamperId)) {
        setDraggedId(null);
        setDropIndex(null);
        setIsDragging(false);
        return;
      }

      if (selectedStreamers.length >= 4) {
        // max reached
        setDraggedId(null);
        setDropIndex(null);
        setIsDragging(false);
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
      setDraggedId(null);
      setDropIndex(null);
      setIsDragging(false);
      return;
    }

    // Internal move: finalize reorder using draggedId and dropIndex (or passed index)
    const internalId = e.dataTransfer?.getData('text/plain') || draggedId;
    const targetIndex = typeof index === 'number' ? index : (dropIndex ?? null);

    if (!internalId) {
      // nothing to do
      setDraggedId(null);
      setDropIndex(null);
      setIsDragging(false);
      setPreviewStreamer(null);
      setPreviewPos(null);
      return;
    }

    if (selectedStreamers.length === 0) {
      // Reordering only supported when user has explicit selection
      setDraggedId(null);
      setDropIndex(null);
      setIsDragging(false);
      return;
    }

    const currentOrder = [...selectedStreamers];
    const existingIndex = currentOrder.indexOf(internalId);
    // If it's not in the list (shouldn't happen for internal drags), ignore
    if (existingIndex === -1) {
      setDraggedId(null);
      setDropIndex(null);
      setIsDragging(false);
      return;
    }

    // Remove the dragged id
    currentOrder.splice(existingIndex, 1);

    // Compute insertion index
    let insertAt = targetIndex ?? currentOrder.length;
    // If removing an earlier element shifted the index, adjust
    if (existingIndex < insertAt) insertAt = Math.max(0, insertAt);
    if (insertAt > currentOrder.length) insertAt = currentOrder.length;

    currentOrder.splice(insertAt, 0, internalId);
    setSelectedStreamers(currentOrder);

    // clear drag state
    setDraggedId(null);
    setDropIndex(null);
    setIsDragging(false);
    setPreviewStreamer(null);
    setPreviewPos(null);
  };

  // Helper to add an external bootcamper id at a given index (used by grid onDrop)
  const addExternalBootcamperAt = useCallback((bootcamperId: string, index?: number) => {
    // Validate live
    const candidate = liveStreamers.find(s => s.id === bootcamperId);
    if (!candidate || !candidate.twitchStreams || candidate.twitchStreams.length === 0 || !candidate.twitchStreams[0].live) {
      setDraggedId(null);
      setDropIndex(null);
      setIsDragging(false);
      setExternalDragActive(false);
      return false;
    }
    if (selectedStreamers.includes(bootcamperId)) {
      setDraggedId(null);
      setDropIndex(null);
      setIsDragging(false);
      setExternalDragActive(false);
      return false;
    }
    if (selectedStreamers.length >= 4) {
      setDraggedId(null);
      setDropIndex(null);
      setIsDragging(false);
      setExternalDragActive(false);
      return false;
    }

    setExplicitSelection(true);
    setSelectedStreamers(prev => {
      const newOrder = [...prev];
      if (typeof index === 'number') {
        newOrder.splice(index, 0, bootcamperId);
      } else {
        newOrder.push(bootcamperId);
      }
      return newOrder;
    });

    setDraggedId(null);
    setDropIndex(null);
    setIsDragging(false);
    setExternalDragActive(false);
    return true;
  }, [liveStreamers, selectedStreamers, setSelectedStreamers, setExplicitSelection]);

  // expose via ref for window-level handlers
  useEffect(() => { addExternalRef.current = addExternalBootcamperAt; }, [addExternalBootcamperAt]);

  // clearSelection removed — clearing is handled via explicit selection controls or removeStream

  const handleLobbyClick = (bootcamperId: string) => {
    setSelectedLobbyId(bootcamperId);
    setShowLobbyModal(true);
  };

  // Window-level handlers to support dragging bootcampers over iframes where dragover/drop
  // may not reliably reach the grid element. Uses the global fallback __bootcamperDragId.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onDragOverWindow = (ev: DragEvent) => {
      try {
        const gid = (window as unknown as { __bootcamperDragId?: string | null }).__bootcamperDragId;
        if (!gid) return;
        // update external drag active and drop index based on pointer
        setExternalDragActive(true);
        const clientX = ev.clientX;
        const clientY = ev.clientY;
        // use ref to avoid calling a function declared later
        const fn = computeDropRef.current;
        if (fn) setDropIndex(fn(clientX));
        // show a floating preview for external drags (follow cursor)
        try {
          const candidate = liveStreamersRef.current.find(s => s.id === gid) || null;
          setPreviewStreamer(candidate);
          setPreviewPos({ x: clientX + 6, y: clientY + 6 });
        } catch {}
        ev.preventDefault();
      } catch {}
    };

    const onDropWindow = (ev: DragEvent) => {
      try {
        const gid = (window as unknown as { __bootcamperDragId?: string | null }).__bootcamperDragId;
        const transferred = ev.dataTransfer && ev.dataTransfer.getData && ev.dataTransfer.getData('text/bootcamper');
        if (!gid) return;
        // If dataTransfer provided the id, grid onDrop will handle it; only handle fallback cases
        if (transferred) return;
        ev.preventDefault();
        // Insert at computed index
        const fn = computeDropRef.current;
        const idx = fn ? fn(ev.clientX) : 0;
        const addFn = addExternalRef.current;
        if (addFn) addFn(gid, idx);
        try { (window as unknown as { __bootcamperDragId?: string | null }).__bootcamperDragId = null; } catch {}
        setExternalDragActive(false);
        // clear preview
        setPreviewStreamer(null);
        setPreviewPos(null);
      } catch {}
    };

    const onDragEndWindow = () => {
      try { (window as unknown as { __bootcamperDragId?: string | null }).__bootcamperDragId = null; } catch {}
      setExternalDragActive(false);
      setDropIndex(null);
      setPreviewStreamer(null);
      setPreviewPos(null);
    };

    const onDragLeaveWindow = (ev: DragEvent) => {
      // clear external drag when leaving the window
      if (ev.clientX <= 0 || ev.clientY <= 0 || ev.clientX >= window.innerWidth || ev.clientY >= window.innerHeight) {
        setExternalDragActive(false);
        setDropIndex(null);
      }
    };

    window.addEventListener('dragover', onDragOverWindow);
    window.addEventListener('drop', onDropWindow);
    window.addEventListener('dragend', onDragEndWindow);
    const onDragStartWindow = (ev: DragEvent) => {
      try {
        const gid = (window as unknown as { __bootcamperDragId?: string | null }).__bootcamperDragId;
        if (gid) {
          setExternalDragActive(true);
          const candidate = liveStreamersRef.current.find(s => s.id === gid) || null;
          setPreviewStreamer(candidate);
          try { setPreviewPos({ x: ev.clientX + 6, y: ev.clientY + 6 }); } catch {}
        }
      } catch {}
    };
    window.addEventListener('dragstart', onDragStartWindow);
    window.addEventListener('dragleave', onDragLeaveWindow);

    return () => {
      window.removeEventListener('dragover', onDragOverWindow);
      window.removeEventListener('drop', onDropWindow);
      window.removeEventListener('dragend', onDragEndWindow);
      window.removeEventListener('dragleave', onDragLeaveWindow);
      window.removeEventListener('dragstart', onDragStartWindow);
    };
  }, []);

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
                <div
                  ref={streamGridRef}
                  onDragEnter={(e) => {
                    // if an external Bootcamper drag is entering, mark externalDragActive
                    try {
                      const types = e.dataTransfer?.types;
                      if (types && Array.from(types).includes('text/bootcamper')) setExternalDragActive(true);
                      else {
                        // fallback: some browsers/iframes may prevent types; use global set by BootcamperCard drag start
                        const globalId = (window as unknown as { __bootcamperDragId?: string | null }).__bootcamperDragId;
                        if (globalId) setExternalDragActive(true);
                      }
                    } catch {}
                  }}
                  onDragLeave={() => { setExternalDragActive(false); }}
                  onDragOver={(e) => { e.preventDefault(); if (isDragging && draggedId) setDropIndex(computeDropIndexFromX(e.clientX)); else setDropIndex(computeDropIndexFromX(e.clientX)); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setExternalDragActive(false);
                    // If dataTransfer didn't carry the bootcamper id (iframe issues), fall back to global
                    const bootcamperId = e.dataTransfer?.getData('text/bootcamper') || (window as unknown as { __bootcamperDragId?: string | null }).__bootcamperDragId || null;
                    if (bootcamperId) {
                      // Use direct insertion helper to add the external bootcamper at the computed index
                      addExternalBootcamperAt(bootcamperId, computeDropIndexFromX(e.clientX));
                    } else {
                      handleDrop(e, computeDropIndexFromX(e.clientX));
                    }
                  }}
                  className={`relative grid gap-3 ${
                  streamsToShow.length === 1 ? 'grid-cols-1' :
                  streamsToShow.length === 2 ? 'grid-cols-2' :
                  streamsToShow.length === 3 ? 'grid-cols-2' : // 2 on top, 1 on bottom
                  'grid-cols-2' // 4 streams in 2x2
                }`}>
                  {/* internal overlay to reliably capture pointer events over iframes */}
                  {(isDragging || externalDragActive) && (
                    <div
                      className="absolute inset-0 z-40"
                      onPointerMove={(e) => {
                        const pe = e as React.PointerEvent;
                        const clientX = pe.clientX;
                        const clientY = pe.clientY;
                        // compute drop index from pointer within container
                        setDropIndex(computeDropIndexFromX(clientX));
                        setPreviewPos({ x: clientX + 6, y: clientY + 6 });
                      }}
                      onPointerUp={(e) => {
                        const clientX = (e as React.PointerEvent).clientX;
                        finalizeInternalReorder(computeDropIndexFromX(clientX));
                      }}
                      style={{ touchAction: 'none' }}
                    />
                  )}
                  {streamsToShow.length === 0 && !isDragging && !externalDragActive && (
                    <div className="col-span-2 aspect-[16/9] rounded-xl bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center text-center p-8">
                      <div className="max-w-xl">
                        <h2 className="text-2xl font-semibold text-gray-100 mb-2">No streams selected</h2>
                        <p className="text-gray-400">Click &quot;Add&quot; on a bootcamper, or drag a live bootcamper here to start watching. You can also clear selections to see a blank canvas.</p>
                      </div>
                    </div>
                  )}

                  {(() => {
                    const base = streamsToShow.slice();
                    let visual = base.slice();
                    // if dragging, remove draggedId from visual and insert a placeholder at dropIndex
                    const PLACEHOLDER_ID = '__PLACEHOLDER__';
                    type VisualItem = Bootcamper | { id: string };
                    let visualItems: VisualItem[] = base.slice();
                    if ((isDragging && draggedId) || externalDragActive) {
                      // when dragging a selected stream internally, remove it from the visual list
                      visualItems = base.filter(s => !(isDragging && draggedId && s.id === draggedId));
                      const insertAt = Math.min(Math.max(0, dropIndex ?? visualItems.length), visualItems.length);
                      const placeholder: VisualItem = { id: PLACEHOLDER_ID };
                      visualItems = [...visualItems.slice(0, insertAt), placeholder, ...visualItems.slice(insertAt)];
                      visual = visualItems as Bootcamper[];
                    } else {
                      visual = base.slice();
                    }

                    return (
                      <>
                        {visual.map((streamer, vIdx) => {
                          if ((streamer as unknown as { id: string }).id === PLACEHOLDER_ID) {
                            return (
                              <div key={`ph-${vIdx}`} className={`col-span-1 flex justify-center items-center pointer-events-none ${dropIndex === vIdx ? 'z-20' : ''}`}>
                                <div className={`w-full ${dropIndex === vIdx ? '' : 'opacity-30'}`}>{dropIndex === vIdx ? renderPlaceholder(vIdx) : <div className="h-2" />}</div>
                              </div>
                            );
                          }

                          return (
                            <div key={streamer.id} className="">
                              <div
                                data-stream-id={streamer.id}
                                draggable={selectedStreamers.length > 0}
                                onDragStart={(e) => handleDragStart(e, vIdx, streamer.id)}
                                onDragOver={(e) => handleDragOver(e, vIdx)}
                                onDragEnd={() => handleDragEnd()}
                                onDrop={(e) => handleDrop(e, vIdx)}
                                className={`${
                                  streamsToShow.length === 1 ? 'col-span-1 aspect-video' :
                                  streamsToShow.length === 2 ? 'col-span-1 aspect-video' :
                                  streamsToShow.length === 3 && vIdx === 2 ? 'col-span-2 aspect-[2/1]' :
                                  'col-span-1 aspect-video'
                                } bg-gray-900 rounded-xl overflow-hidden relative group ring-1 ring-gray-800 hover:ring-purple-500/50 transform-gpu will-change-transform transition-all duration-300 ease-out ${
                                  (draggedId && streamer.id === draggedId) ? 'opacity-80 scale-105' : (isDragging && dropIndex === vIdx && streamer.id !== draggedId) ? 'opacity-60 scale-95' : ''
                                } ${selectedStreamers.length > 0 ? 'cursor-move' : ''}`}
                                style={ (draggedId && streamer.id === draggedId) ? { zIndex: 10000, position: 'relative' } : undefined }
                              >
                                <div className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleStreamerSelection(streamer.id); }}
                                    className={`p-2 rounded-lg backdrop-blur-sm transition-all ${selectedStreamers.includes(streamer.id) ? 'bg-purple-500 text-white ring-2 ring-purple-400' : 'bg-black/50 text-gray-300 hover:bg-black/70'}`}
                                    title={selectedStreamers.includes(streamer.id) ? 'Deselect stream' : 'Select stream'}
                                  >
                                    {selectedStreamers.includes(streamer.id) ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                  </button>
                                </div>

                                <div className="absolute top-2 left-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto">
                                  <div
                                    draggable={selectedStreamers.length > 0}
                                    onDragStart={(e) => handleDragStart(e, vIdx, streamer.id)}
                                    onMouseDown={(e) => startDrag(streamer.id, vIdx, { x: e.clientX, y: e.clientY })}
                                    onTouchStart={(e) => { const t = (e as React.TouchEvent).touches[0]; startDrag(streamer.id, vIdx, { x: t.clientX, y: t.clientY }); }}
                                    className={`p-2 bg-black/60 backdrop-blur-sm rounded-lg text-gray-200 ${selectedStreamers.length === 0 ? 'opacity-90' : 'opacity-100'}`}
                                    title="Drag to reorder"
                                  >
                                    <GripVertical className="w-4 h-4" />
                                  </div>
                                </div>

                                <div className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto">
                                  <button onClick={(e) => { e.stopPropagation(); removeStream(streamer.id); }} title="Close stream" className="p-2 bg-black/60 backdrop-blur-sm rounded-lg text-gray-200 hover:bg-red-600/80"><X className="w-4 h-4" /></button>
                                </div>

                                <iframe src={getTwitchEmbedUrl(streamer.twitchLogin!)} width="100%" height="100%" frameBorder="0" allowFullScreen className="w-full h-full" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" />
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
                                  <div className="flex items-center justify-end">
                                    {selectedStreamMode === 'teammates' && (
                                      <span className="ml-2 bg-purple-500/90 text-white text-xs px-2 py-1 rounded-full whitespace-nowrap">Same Game</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
                {/* allow dropping at end (after last tile) - only render if visual mapping didn't already include a placeholder */}
                {/* only render explicit end placeholder when there are existing streams; empty-grid uses visual placeholder */}
                {(isDragging || externalDragActive) && streamsToShow.length > 0 && dropIndex === streamsToShow.length && renderPlaceholder(streamsToShow.length)}
                {/* Pointer capture overlay: appears during drag to reliably receive pointermove/up events even over iframes */}
                  {isDragging && (
                  <div
                    className="absolute inset-0 z-50"
                    onPointerMove={(e) => {
                      const pe = e as React.PointerEvent;
                      const clientX = pe.clientX;
                      const clientY = pe.clientY;
                      setDropIndex(computeDropIndexFromX(clientX));
                      // tighter preview offset
                      setPreviewPos({ x: clientX + 6, y: clientY + 6 });
                    }}
                    onPointerUp={(e) => {
                      const clientX = (e as React.PointerEvent).clientX;
                      finalizeInternalReorder(computeDropIndexFromX(clientX));
                    }}
                    onPointerCancel={() => finalizeInternalReorder()}
                    style={{ touchAction: 'none' }}
                  />
                )}
                {/* Floating preview follows pointer while dragging */}
                {isDragging && previewStreamer && previewPos && (
                  previewPortalElRef.current ? createPortal(
                    <div className="fixed z-[12000] pointer-events-none" style={{ left: previewPos.x, top: previewPos.y, width: 300, maxWidth: '40vw', transform: 'translate(-4px,-4px)', transition: 'transform 120ms linear' }}>
                      <div className="rounded-lg overflow-hidden ring-2 ring-purple-500/30 shadow-[0_30px_80px_rgba(0,0,0,0.85)] bg-black">
                        <iframe
                          src={getTwitchEmbedUrl(previewStreamer.twitchLogin!)}
                          width="300"
                          height="168"
                          frameBorder="0"
                          allowFullScreen
                          className="w-full h-full opacity-95"
                          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                        />
                        <div className="p-2 bg-black/70 text-xs text-white">
                          {previewStreamer.name || previewStreamer.summonerName}
                        </div>
                      </div>
                    </div>,
                    previewPortalElRef.current
                  ) : (
                    <div className="fixed z-[12000] pointer-events-none" style={{ left: previewPos.x, top: previewPos.y, width: 300, maxWidth: '40vw', transform: 'translate(-4px,-4px)', transition: 'transform 120ms linear' }}>
                      <div className="rounded-lg overflow-hidden ring-2 ring-purple-500/30 shadow-[0_30px_80px_rgba(0,0,0,0.85)] bg-black">
                        <iframe
                          src={getTwitchEmbedUrl(previewStreamer.twitchLogin!)}
                          width="300"
                          height="168"
                          frameBorder="0"
                          allowFullScreen
                          className="w-full h-full opacity-95"
                          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                        />
                        <div className="p-2 bg-black/70 text-xs text-white">
                          {previewStreamer.name || previewStreamer.summonerName}
                        </div>
                      </div>
                    </div>
                  )
                )}
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
              <TabsTrigger value="live" className="data-[state=active]:bg-gray-800 cursor-pointer">In Game</TabsTrigger>
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

  const handleDragStartLocal = (e: React.DragEvent) => {
    if (!isStreaming) return;
    try {
      e.dataTransfer?.setData('text/bootcamper', bootcamper.id);
      e.dataTransfer!.effectAllowed = 'copy';
      try { (window as unknown as { __bootcamperDragId?: string | null }).__bootcamperDragId = bootcamper.id; } catch {}
    } catch {
      // ignore
    }
  };

  const handleDragEndLocal = () => {
    try { (window as unknown as { __bootcamperDragId?: string | null }).__bootcamperDragId = null; } catch {}
  };

  return (
    <div
      draggable={isStreaming}
      onDragStart={handleDragStartLocal}
      onDragEnd={handleDragEndLocal}
      className="group p-4 bg-gray-900/50 rounded-xl border border-gray-800 hover:border-gray-700 hover:bg-gray-900/70 transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-white truncate">
              {bootcamper.name || bootcamper.summonerName}
            </h3>
            <GameProfileLinks 
              riotId={bootcamper.riotId}
              summonerName={bootcamper.summonerName}
              region={bootcamper.region}
              size="sm"
              className="flex-shrink-0"
            />
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
