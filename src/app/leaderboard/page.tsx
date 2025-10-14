'use client';

import { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { GridComponent, ColumnsDirective, ColumnDirective, Page, Filter, Sort, Toolbar, Inject } from '@syncfusion/ej2-react-grids';
import { Badge } from '@/components/ui/badge';
import { Trophy, TrendingUp, Target } from 'lucide-react';
import { ListSwitcher } from '@/components/list-switcher';
import { GameProfileLinks } from '@/components/game-profile-links';
import { Modal } from '@/components/ui/modal';
import LiveGamesSection from '../LiveGamesSection';

interface RankData {
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface LeaderboardEntry {
  id: string;
  summonerName: string;
  name?: string | null;
  riotId?: string | null;
  region: string;
  role?: string | null;
  gamesPlayed: number;
  status: string;
  twitchLogin?: string | null;
  twitchProfileImage?: string | null;
  soloQueue: RankData | null;
  flexQueue: RankData | null;
  peakRank: RankData | null;
}

interface GameData {
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

interface BootcamperWithGames {
  id: string;
  name?: string | null;
  summonerName: string;
  region: string;
  riotId: string | null;
  puuid?: string;
  games?: GameData[];
}

export default function LeaderboardPage() {
  const { data: session } = useSession();
  const [bootcampers, setBootcampers] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showLobbyModal, setShowLobbyModal] = useState(false);
  const [selectedBootcamper, setSelectedBootcamper] = useState<BootcamperWithGames | null>(null);
  const [isLoadingGameData, setIsLoadingGameData] = useState(false);
  const gridRef = useRef<GridComponent>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const prevHighlightRef = useRef<Array<{ el: HTMLElement; prevStyle: string }> | null>(null);

  // Scroll to a bootcamper row in the Syncfusion grid and apply a temporary highlight.
  const scrollToBootcamper = (bootcamperId?: string | null) => {
    if (!bootcamperId) return;

    try {
      const gridEl = document.querySelector('.e-grid');
      if (!gridEl) return;

      let targetRow: HTMLElement | null = null;

      const rows = Array.from(gridEl.querySelectorAll<HTMLTableRowElement>('.e-row'));
      for (const row of rows) {
        const rowText = row.textContent || '';
        if (rowText.includes(bootcamperId)) {
          targetRow = row as HTMLElement;
          break;
        }
        const dataUid = row.getAttribute('data-uid') || '';
        if (dataUid && dataUid.includes(bootcamperId)) {
          targetRow = row as HTMLElement;
          break;
        }
      }

      if (!targetRow) {
        const boot = bootcampers.find(b => b.id === bootcamperId || b.summonerName === bootcamperId);
        if (boot) {
          targetRow = rows.find(r => (r.textContent || '').includes(boot.summonerName)) as HTMLElement | undefined || null;
        }
      }

      if (!targetRow) return;

      targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });

      const cells = Array.from(targetRow.querySelectorAll<HTMLElement>('.e-rowcell'));
      const descendants = Array.from(targetRow.querySelectorAll<HTMLElement>('*'));
      const elementsToHighlight: HTMLElement[] = Array.from(new Set([targetRow, ...cells, ...descendants]));

      if (prevHighlightRef.current) {
        for (const prev of prevHighlightRef.current) {
          try {
            if (prev.prevStyle) prev.el.setAttribute('style', prev.prevStyle);
            else prev.el.removeAttribute('style');
          } catch {
            // ignore
          }
        }
        prevHighlightRef.current = null;
      }

      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }

      const saved: Array<{ el: HTMLElement; prevStyle: string }> = [];
      for (const el of elementsToHighlight) {
        const prev = el.getAttribute('style') || '';
        saved.push({ el, prevStyle: prev });

        try {
          const current = el.getAttribute('style') || '';
          const transition = 'transition: color 0.25s ease-in-out, background-color 0.25s ease-in-out;';
          el.setAttribute('style', current + transition);
        } catch {
          // ignore
        }

        // Force foreground color and weight with important so it overrides grid cell CSS
        // el.style.setProperty('color', '#001100', 'important'); // amber-400
        el.style.setProperty('font-weight', '700', 'important');
        el.style.setProperty('background-color', '#1a1a1a', 'important');
        // el.style.setProperty('box-shadow', 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)', 'important');
      }
      prevHighlightRef.current = saved;

      // Restore after 2 seconds
      highlightTimeoutRef.current = window.setTimeout(() => {
        if (prevHighlightRef.current) {
          for (const prev of prevHighlightRef.current) {
            try {
              if (prev.prevStyle) prev.el.setAttribute('style', prev.prevStyle);
              else prev.el.removeAttribute('style');
            } catch {
              // ignore
            }
          }
        }
        prevHighlightRef.current = null;
        highlightTimeoutRef.current = null;
      }, 2000);
    } catch (err) {
      console.error('scrollToBootcamper error', err);
    }
  };
  
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

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const listType = session?.user ? currentList : 'default';
        const response = await fetch(`/api/bootcampers/ranks?listType=${listType}`);
        const data = await response.json();
        
        // Sort by rank (Challenger > GM > Master, etc) and LP
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

        // Division order (I is best, IV is worst)
        const divisionOrder: Record<string, number> = {
          'I': 4,
          'II': 3,
          'III': 2,
          'IV': 1,
        };

        data.sort((a: LeaderboardEntry, b: LeaderboardEntry) => {
          const aRank = a.soloQueue || a.flexQueue;
          const bRank = b.soloQueue || b.flexQueue;
          
          if (!aRank && !bRank) return 0;
          if (!aRank) return 1;
          if (!bRank) return -1;
          
          const aTier = rankOrder[aRank.tier] || 0;
          const bTier = rankOrder[bRank.tier] || 0;
          
          // First compare tiers
          if (aTier !== bTier) return bTier - aTier;
          
          // For Master+ (no divisions), just compare LP
          if (aTier >= 6) { // Master, GM, Challenger
            return bRank.leaguePoints - aRank.leaguePoints;
          }
          
          // For Diamond and below, compare divisions first
          const aDivision = divisionOrder[aRank.rank] || 0;
          const bDivision = divisionOrder[bRank.rank] || 0;
          
          if (aDivision !== bDivision) return bDivision - aDivision;
          
          // Same tier and division, compare LP
          return bRank.leaguePoints - aRank.leaguePoints;
        });

        setBootcampers(data);
      } catch (error) {
        console.error('Error fetching leaderboard:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 300000); // Refresh every 5 minutes
    return () => clearInterval(interval);
  }, [currentList, session?.user]);

  // Add search handler for auto-search on any input
  useEffect(() => {
    if (!gridRef.current) return;

    const handleSearch = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const searchValue = target.value;
      
      // Trigger search on any input change
      gridRef.current?.search(searchValue);
    };

    // Wait for grid to be rendered and find the search input
    const checkForSearchInput = setInterval(() => {
      const searchInput = document.querySelector('.e-search input') as HTMLInputElement;
      if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
        clearInterval(checkForSearchInput);
        
        // Cleanup function
        return () => {
          searchInput.removeEventListener('input', handleSearch);
        };
      }
    }, 100);

    // Cleanup interval after 5 seconds if search input not found
    setTimeout(() => clearInterval(checkForSearchInput), 5000);

    return () => clearInterval(checkForSearchInput);
  }, [isLoading]);


  const positionTemplate = (props: LeaderboardEntry) => {
    // Find the actual position in the bootcampers array
    const position = bootcampers.findIndex(b => b.id === props.id) + 1;
    
    // Top 3 medal designs
    if (position === 1) {
      return (
        <div className="flex items-center justify-center">
          <div className="relative group">
            {/* Gold Medal SVG */}
            <svg width="56" height="56" viewBox="0 0 56 56" className="drop-shadow-2xl transform group-hover:scale-110 transition-transform duration-200">
              {/* Medal circle */}
              <circle cx="28" cy="32" r="20" fill="url(#goldGradient)" stroke="#B8860B" strokeWidth="2"/>
              <circle cx="28" cy="32" r="16" fill="url(#goldInner)" opacity="0.9"/>
              
              {/* Star in center */}
              <path d="M28 22l2.5 7.5h8l-6.5 5 2.5 7.5-6.5-5-6.5 5 2.5-7.5-6.5-5h8z" fill="#FFD700" stroke="#B8860B" strokeWidth="1"/>
              
              {/* Ribbon */}
              <path d="M18 12 L18 28 L23 24 L28 28 L33 24 L38 28 L38 12 Z" fill="#C9A500" stroke="#B8860B" strokeWidth="1.5"/>
              <path d="M18 12 L38 12 L38 20 L18 20 Z" fill="#FFD700"/>
              
              {/* Number */}
              <text x="28" y="36" textAnchor="middle" fill="#FFFFFF" fontSize="14" fontWeight="bold" fontFamily="Arial">1</text>
              
              {/* Gradients */}
              <defs>
                <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FFD700"/>
                  <stop offset="50%" stopColor="#FFA500"/>
                  <stop offset="100%" stopColor="#DAA520"/>
                </linearGradient>
                <radialGradient id="goldInner">
                  <stop offset="0%" stopColor="#FFED4E"/>
                  <stop offset="100%" stopColor="#FFD700"/>
                </radialGradient>
              </defs>
            </svg>
            {/* Glow effect */}
            <div className="absolute inset-0 bg-yellow-400/20 rounded-full blur-xl -z-10 group-hover:bg-yellow-400/30 transition-all"></div>
          </div>
        </div>
      );
    }
    
    if (position === 2) {
      return (
        <div className="flex items-center justify-center">
          <div className="relative group">
            {/* Silver Medal SVG */}
            <svg width="52" height="52" viewBox="0 0 52 52" className="drop-shadow-xl transform group-hover:scale-110 transition-transform duration-200">
              {/* Medal circle */}
              <circle cx="26" cy="30" r="18" fill="url(#silverGradient)" stroke="#999999" strokeWidth="2"/>
              <circle cx="26" cy="30" r="14" fill="url(#silverInner)" opacity="0.9"/>
              
              {/* Star in center */}
              <path d="M26 21l2 6h6.5l-5 4 2 6.5-5.5-4-5.5 4 2-6.5-5-4h6.5z" fill="#E8E8E8" stroke="#999999" strokeWidth="1"/>
              
              {/* Ribbon */}
              <path d="M17 10 L17 26 L21 23 L26 26 L31 23 L35 26 L35 10 Z" fill="#B0B0B0" stroke="#999999" strokeWidth="1.5"/>
              <path d="M17 10 L35 10 L35 18 L17 18 Z" fill="#D3D3D3"/>
              
              {/* Number */}
              <text x="26" y="34" textAnchor="middle" fill="#FFFFFF" fontSize="13" fontWeight="bold" fontFamily="Arial">2</text>
              
              {/* Gradients */}
              <defs>
                <linearGradient id="silverGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#E8E8E8"/>
                  <stop offset="50%" stopColor="#C0C0C0"/>
                  <stop offset="100%" stopColor="#A8A8A8"/>
                </linearGradient>
                <radialGradient id="silverInner">
                  <stop offset="0%" stopColor="#F5F5F5"/>
                  <stop offset="100%" stopColor="#D3D3D3"/>
                </radialGradient>
              </defs>
            </svg>
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gray-300/20 rounded-full blur-xl -z-10 group-hover:bg-gray-300/30 transition-all"></div>
          </div>
        </div>
      );
    }
    
    if (position === 3) {
      return (
        <div className="flex items-center justify-center">
          <div className="relative group">
            {/* Bronze Medal SVG */}
            <svg width="52" height="52" viewBox="0 0 52 52" className="drop-shadow-xl transform group-hover:scale-110 transition-transform duration-200">
              {/* Medal circle */}
              <circle cx="26" cy="30" r="18" fill="url(#bronzeGradient)" stroke="#8B4513" strokeWidth="2"/>
              <circle cx="26" cy="30" r="14" fill="url(#bronzeInner)" opacity="0.9"/>
              
              {/* Star in center */}
              <path d="M26 21l2 6h6.5l-5 4 2 6.5-5.5-4-5.5 4 2-6.5-5-4h6.5z" fill="#DAA520" stroke="#8B4513" strokeWidth="1"/>
              
              {/* Ribbon */}
              <path d="M17 10 L17 26 L21 23 L26 26 L31 23 L35 26 L35 10 Z" fill="#A0522D" stroke="#8B4513" strokeWidth="1.5"/>
              <path d="M17 10 L35 10 L35 18 L17 18 Z" fill="#CD7F32"/>
              
              {/* Number */}
              <text x="26" y="34" textAnchor="middle" fill="#FFFFFF" fontSize="13" fontWeight="bold" fontFamily="Arial">3</text>
              
              {/* Gradients */}
              <defs>
                <linearGradient id="bronzeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#CD7F32"/>
                  <stop offset="50%" stopColor="#B8733F"/>
                  <stop offset="100%" stopColor="#8B4513"/>
                </linearGradient>
                <radialGradient id="bronzeInner">
                  <stop offset="0%" stopColor="#E39650"/>
                  <stop offset="100%" stopColor="#CD7F32"/>
                </radialGradient>
              </defs>
            </svg>
            {/* Glow effect */}
            <div className="absolute inset-0 bg-orange-600/20 rounded-full blur-xl -z-10 group-hover:bg-orange-600/30 transition-all"></div>
          </div>
        </div>
      );
    }
    
    return (
      <div className="flex items-center justify-center">
        <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
          {position}
        </div>
      </div>
    );
  };

  const summonerTemplate = (props: LeaderboardEntry) => {
    const roleColors: Record<string, string> = {
      pro: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      streamer: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      rookie: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    };
    
  const twitchUrl = props.twitchLogin ? `https://www.twitch.tv/${props.twitchLogin}` : null;
  const isStreaming = Boolean((props as unknown as Record<string, unknown>).twitchIsLive) || props.status === 'streaming';
    
    return (
      <div className="flex items-center gap-3 justify-start">
        {/* Twitch Profile Picture */}
        {twitchUrl && props.twitchProfileImage ? (
          <div className="relative flex-shrink-0">
            <a 
              href={twitchUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:opacity-80 transition-opacity"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={`data:image/jpeg;base64,${props.twitchProfileImage}`}
                alt={`${props.name || props.summonerName} profile`}
                className={`w-12 h-12 rounded-full object-cover ${isStreaming ? 'ring-2 ring-red-500/60' : 'ring-2 ring-purple-500/30'}`}
              />
            </a>
            {isStreaming && (
              <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 z-10 bg-red-600 text-white text-[11px] px-1 py-[1px] rounded-full font-medium">
                Live
              </div>
            )}
          </div>
        ) : twitchUrl ? (
          <div className="relative flex-shrink-0">
            <a 
              href={twitchUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:opacity-80 transition-opacity"
            >
              <div className={`w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center ${isStreaming ? 'ring-2 ring-red-500/60' : 'ring-2 ring-purple-500/30'}`}>
                <span className="text-purple-400 text-xs font-bold">
                  {(props.name || props.summonerName).charAt(0).toUpperCase()}
                </span>
              </div>
            </a>
            {isStreaming && (
              <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 z-10 bg-red-600 text-white text-[8px] px-1 py-[1px] rounded-full font-medium">
                Live
              </div>
            )}
          </div>
        ) : (
          <div className={`relative w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center ${isStreaming ? 'ring-2 ring-red-500/60' : 'ring-2 ring-gray-600'}`}>
            <span className="text-gray-400 text-xs font-bold">
              {(props.name || props.summonerName).charAt(0).toUpperCase()}
            </span>
            {isStreaming && (
              <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 z-10 bg-red-600 text-white text-[8px] px-1 py-[1px] rounded-full font-medium">
                Live
              </div>
            )}
          </div>
        )}
        
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-medium text-lg">{props.name || props.summonerName}</span>
            {props.role && (
              <span className={`text-xs px-2 py-0.5 rounded-full border ${roleColors[props.role] || ''}`}>
                {props.role.charAt(0).toUpperCase() + props.role.slice(1)}
              </span>
            )}
          </div>
          {props.riotId && (
            <span className="text-xs text-gray-500">{props.riotId}</span>
          )}
        </div>
      </div>
    );
  };

  const rankTemplate = (props: LeaderboardEntry) => {
    const rank = props.soloQueue || props.flexQueue;
    if (!rank) return <span className="text-gray-400">Unranked</span>;
    
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
    
    const tierColor = tierColors[rank.tier] || 'text-gray-400';
    const tierDisplay = rank.tier.charAt(0) + rank.tier.slice(1).toLowerCase();
    const queueType = props.soloQueue ? 'Solo/Duo' : 'Flex';
    
    // Local rank emblem URLs
    const getRankEmblemUrl = (tier: string) => {
      const tierLower = tier.toLowerCase();
      return `/rank-images/${tierLower}.png`;
    };
    
    return (
      <div className="flex items-center gap-3 justify-center">
        <Image 
          src={getRankEmblemUrl(rank.tier)} 
          alt={`${rank.tier} emblem`}
          width={48}
          height={48}
          className="object-contain"
          unoptimized
        />
        <div className="flex flex-col gap-0">
          <div className="flex items-center gap-2">
            <span className={`font-semibold ${tierColor}`}>
              {tierDisplay}{rank.tier === 'MASTER' || rank.tier === 'GRANDMASTER' || rank.tier === 'CHALLENGER' ? '' : ` ${rank.rank}`}
            </span>
            <span className="text-sm text-gray-500">
              {rank.leaguePoints} LP
            </span>
          </div>
          <span className="text-xs text-gray-400">{queueType}</span>
        </div>
      </div>
    );
  };

  const peakRankTemplate = (props: LeaderboardEntry) => {
    const rank = props.peakRank;
    if (!rank) return <span className="text-gray-400">—</span>;
    
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
    
    const tierColor = tierColors[rank.tier] || 'text-gray-400';
    const tierDisplay = rank.tier.charAt(0) + rank.tier.slice(1).toLowerCase();
    
    const getRankEmblemUrl = (tier: string) => {
      const tierLower = tier.toLowerCase();
      return `/rank-images/${tierLower}.png`;
    };
    
    return (
      <div className="flex items-center gap-2 justify-center">
        <Image 
          src={getRankEmblemUrl(rank.tier)} 
          alt={`${rank.tier} emblem`}
          width={32}
          height={32}
          className="object-contain"
          unoptimized
        />
        <div className="flex flex-col gap-0">
          <span className={`font-semibold ${tierColor}`}>
            {tierDisplay}{rank.tier === 'MASTER' || rank.tier === 'GRANDMASTER' || rank.tier === 'CHALLENGER' ? '' : ` ${rank.rank}`}
          </span>
          <span className="text-xs text-gray-500">
            {rank.leaguePoints} LP
          </span>
        </div>
      </div>
    );
  };

  const winRateTemplate = (props: LeaderboardEntry) => {
    const rank = props.soloQueue || props.flexQueue;
    if (!rank) return <span className="text-gray-400">—</span>;
    
    const winRate = rank.winRate;
    const totalGames = rank.wins + rank.losses;
    const winPercentage = (rank.wins / totalGames) * 100;
    const lossPercentage = (rank.losses / totalGames) * 100;
    
    // Professional color gradients based on win rate tiers
    const getWinRateColors = () => {
      if (winRate >= 60) {
        return {
          gradient: 'from-emerald-500 via-emerald-400 to-emerald-500',
          text: 'text-emerald-400',
          bgGlow: 'bg-emerald-500/5',
          glow: 'shadow-[0_0_12px_rgba(16,185,129,0.2)]',
          ring: 'ring-1 ring-emerald-500/30',
        };
      } else if (winRate >= 50) {
        return {
          gradient: 'from-blue-500 via-blue-400 to-blue-500',
          text: 'text-blue-400',
          bgGlow: 'bg-blue-500/5',
          glow: 'shadow-[0_0_12px_rgba(59,130,246,0.2)]',
          ring: 'ring-1 ring-blue-500/30',
        };
      } else {
        return {
          gradient: 'from-slate-500 via-slate-400 to-slate-500',
          text: 'text-slate-400',
          bgGlow: 'bg-slate-500/5',
          glow: 'shadow-[0_0_10px_rgba(100,116,139,0.15)]',
          ring: 'ring-1 ring-slate-500/30',
        };
      }
    };
    
    const colors = getWinRateColors();
    
    return (
      <div className={`flex items-center gap-4 w-full px-3 py-2 rounded-lg ${colors.bgGlow} transition-all duration-300 hover:scale-[1.02]`}>
        {/* Win rate percentage with enhanced styling */}
        <div className="flex flex-col items-center gap-0.5 min-w-[60px]">
          <span className={`text-xl font-bold ${colors.text} tabular-nums tracking-tight leading-none`}>
            {winRate.toFixed(1)}%
          </span>
          <span className="text-[9px] text-gray-500 font-medium uppercase tracking-wide">{totalGames} Games</span>
        </div>
        
        {/* Professional progress bar */}
        <div className="flex-1 max-w-[190px] space-y-1.5">
          {/* Bar container with improved depth */}
          <div className={`relative h-7 bg-gradient-to-br from-gray-900/80 via-gray-800/60 to-gray-900/80 rounded-lg overflow-hidden border border-gray-700/50 ${colors.glow} ${colors.ring}`}>
            {/* Loss background with subtle gradient */}
            <div className="absolute inset-0 bg-gradient-to-r from-red-600/45 via-red-600/35 to-red-600/25"></div>
            
            {/* Win section with polished gradient */}
            <div 
              className={`relative h-full bg-gradient-to-r ${colors.gradient} transition-all duration-700 ease-out`}
              style={{ width: `${winPercentage}%` }}
            >
              {/* Multi-layer shine effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-shimmer"></div>
              <div className="absolute inset-0 bg-gradient-to-b from-white/15 via-transparent to-black/10"></div>
              
              {/* Win count with better readability */}
              {winPercentage > 20 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-black text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] tracking-tight">
                    {rank.wins}
                  </span>
                </div>
              )}
            </div>
            
            {/* Loss count with improved positioning */}
            {lossPercentage > 20 && (
              <div 
                className="absolute inset-0 flex items-center justify-center"
                style={{ left: `${winPercentage}%` }}
              >
                <span className="text-xs font-black text-white/95 drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] tracking-tight">
                  {rank.losses}
                </span>
              </div>
            )}
          </div>
          
          {/* W/L Record with improved visual hierarchy */}
          <div className="flex items-center justify-center gap-2.5 text-[10px] font-bold">
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"></div>
              <span className="text-emerald-400/90">{rank.wins}W</span>
            </div>
            <div className="w-[3px] h-[3px] rounded-full bg-gray-600"></div>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"></div>
              <span className="text-red-400/90">{rank.losses}L</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const statusTemplate = (props: LeaderboardEntry) => {
    const isLive = props.status === 'in_game';
    
    const handleViewGame = async () => {
      if (!isLive) return;
      
      setIsLoadingGameData(true);
      setShowLobbyModal(true);
      
      try {
        // Fetch full bootcamper data with game details
        const listType = session?.user ? currentList : 'default';
        const response = await fetch(`/api/bootcampers?listType=${listType}`);
        const allBootcampers: BootcamperWithGames[] = await response.json();
        
        // Find the specific bootcamper. The ranks API may return association ids for user lists,
        // while the bootcampers GET returns canonical bootcamper ids and sets `userAssociationId`.
        // Try both matches so the modal works regardless of which id shape the leaderboard used.
        let bootcamper = allBootcampers.find(b => b.id === props.id);
        if (!bootcamper) {
          // Lightweight type guard for objects that might have userAssociationId
          const hasUserAssoc = (x: unknown): x is { userAssociationId?: string | null } => {
            return typeof x === 'object' && x !== null && 'userAssociationId' in (x as Record<string, unknown>);
          };

          bootcamper = allBootcampers.find(b => hasUserAssoc(b) && b.userAssociationId === props.id);
        }
        
        if (bootcamper) {
          setSelectedBootcamper(bootcamper);
        }
      } catch (error) {
        console.error('Error fetching game data:', error);
      } finally {
        setIsLoadingGameData(false);
      }
    };
    
    return (
      <div className="flex gap-2 justify-center items-center">
        {isLive ? (
          <>
            <Badge variant="destructive">In Game</Badge>
            <button
              onClick={handleViewGame}
              className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-1"
              title="View game details"
            >
              <svg 
                className="w-4 h-4" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" 
                />
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" 
                />
              </svg>
            </button>
          </>
        ) : (
          <Badge variant="secondary">Idle</Badge>
        )}
      </div>
    );
  };

  const linksTemplate = (props: LeaderboardEntry) => {
    return (
      <div className="flex justify-center">
        <GameProfileLinks 
          riotId={props.riotId || null}
          summonerName={props.summonerName}
          region={props.region}
          size="md"
        />
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading leaderboard...</div>
      </div>
    );
  }

  const mostGames = bootcampers.reduce((prev, current) => {
    const prevGames = (prev.soloQueue?.wins || 0) + (prev.soloQueue?.losses || 0) + (prev.flexQueue?.wins || 0) + (prev.flexQueue?.losses || 0);
    const currentGames = (current.soloQueue?.wins || 0) + (current.soloQueue?.losses || 0) + (current.flexQueue?.wins || 0) + (current.flexQueue?.losses || 0);
    return currentGames > prevGames ? current : prev;
  }, bootcampers[0] || {});
  
  const highestWinRate = bootcampers
    .filter(b => {
      const games = (b.soloQueue?.wins || 0) + (b.soloQueue?.losses || 0);
      return games >= 5;
    })
    .reduce((prev, current) => {
      const prevWR = prev.soloQueue?.winRate || 0;
      const currentWR = current.soloQueue?.winRate || 0;
      return currentWR > prevWR ? current : prev;
    }, bootcampers[0] || {});

  return (
    <div className="min-h-screen bg-black">
      <div className="mx-auto max-w-[75vw] px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-in">
          <div className="text-center flex-1 space-y-4">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              Bootcamp Leaderboard
            </h1>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Real-time rankings and performance metrics for all Korean bootcampers
            </p>
          </div>
          {session?.user && (
            <div className="flex-shrink-0">
              <ListSwitcher currentList={currentList} onSwitch={setCurrentList} />
            </div>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
          <div
            role="button"
            tabIndex={0}
            onClick={() => scrollToBootcamper(mostGames?.id)}
            className="card-modern p-6 text-center group cursor-pointer"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') scrollToBootcamper(mostGames?.id); }}
          >
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="p-2 rounded-full bg-yellow-500/10">
                <Trophy className="h-6 w-6 text-yellow-500" />
              </div>
            </div>
            <p className="text-sm text-gray-400 mb-1">Most Active Player</p>
            <p className="text-xl font-bold text-white mb-1">{mostGames?.name || mostGames?.summonerName || '—'}</p>
            <p className="text-sm text-gray-500">
              {((mostGames?.soloQueue?.wins || 0) + (mostGames?.soloQueue?.losses || 0) + 
                (mostGames?.flexQueue?.wins || 0) + (mostGames?.flexQueue?.losses || 0))} games played
            </p>
            <div className="h-1 w-12 mx-auto mt-3 bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-full opacity-60 group-hover:opacity-100 transition-opacity" />
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => scrollToBootcamper(highestWinRate?.id)}
            className="card-modern p-6 text-center group cursor-pointer"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') scrollToBootcamper(highestWinRate?.id); }}
          >
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="p-2 rounded-full bg-green-500/10">
                <TrendingUp className="h-6 w-6 text-green-500" />
              </div>
            </div>
            <p className="text-sm text-gray-400 mb-1">Highest Win Rate</p>
            <p className="text-xl font-bold text-white mb-1">{highestWinRate?.name || highestWinRate?.summonerName || '—'}</p>
            <p className="text-sm text-gray-500">
              {highestWinRate?.soloQueue?.winRate?.toFixed(1) || 0}% WR
              ({(highestWinRate?.soloQueue?.wins || 0) + (highestWinRate?.soloQueue?.losses || 0)} games)
            </p>
            <div className="h-1 w-12 mx-auto mt-3 bg-gradient-to-r from-green-500 to-green-600 rounded-full opacity-60 group-hover:opacity-100 transition-opacity" />
          </div>

          <div className="card-modern p-6 text-center group">
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="p-2 rounded-full bg-purple-500/10">
                <Target className="h-6 w-6 text-purple-500" />
              </div>
            </div>
            <p className="text-sm text-gray-400 mb-1">Total Bootcampers</p>
            <p className="text-xl font-bold text-white mb-1">{bootcampers.length}</p>
            <p className="text-sm text-gray-500">
              {bootcampers.filter(b => b.status === 'in_game').length} currently in game
            </p>
            <div className="h-1 w-12 mx-auto mt-3 bg-gradient-to-r from-purple-500 to-purple-600 rounded-full opacity-60 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Leaderboard Grid */}
        <div className="card-modern p-0 overflow-hidden">
          <GridComponent
            ref={gridRef}
            dataSource={bootcampers}
            allowPaging={true}
            allowSorting={true}
            pageSettings={{ pageSize: 10 }}
            toolbar={['Search']}
            height={875}
            enableHover={true}
          >
          <ColumnsDirective>
            <ColumnDirective
              headerText="#"
              width="70"
              textAlign="Center"
              template={positionTemplate}
              allowSorting={false}
            />
            <ColumnDirective
              field="summonerName"
              headerText="Player"
              width="270"
              textAlign="Center"
              template={summonerTemplate}
            />
            <ColumnDirective
              field="soloQueue"
              headerText="Current Rank"
              width="250"
              textAlign="Center"
              template={rankTemplate}
            />
            <ColumnDirective
              field="peakRank"
              headerText="Peak Rank"
              width="140"
              textAlign="Center"
              template={peakRankTemplate}
            />
            <ColumnDirective
              field="soloQueue.winRate"
              headerText="Win Rate"
              width="220"
              textAlign="Center"
              template={winRateTemplate}
            />
            <ColumnDirective
              field="status"
              headerText="Status"
              width="100"
              textAlign="Center"
              template={statusTemplate}
            />
            <ColumnDirective
              headerText="Links"
              width="100"
              textAlign="Center"
              template={linksTemplate}
              allowSorting={false}
            />
          </ColumnsDirective>
          <Inject services={[Page, Filter, Sort, Toolbar]} />
        </GridComponent>
        </div>

        {/* Game Lobby Modal */}
        <Modal
          isOpen={showLobbyModal}
          onClose={() => {
            setShowLobbyModal(false);
            setSelectedBootcamper(null);
          }}
          title={isLoadingGameData ? "Loading game details..." : "Game Lobby Details"}
          maxWidth="6xl"
        >
          {isLoadingGameData ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-lg text-gray-400">Loading...</div>
            </div>
          ) : selectedBootcamper ? (
            <div className="space-y-4">
              <LiveGamesSection
                inGameBootcampers={[selectedBootcamper]}
                expandedByDefault={true}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <div className="text-lg text-gray-400">No game data available</div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}
