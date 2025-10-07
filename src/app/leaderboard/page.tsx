'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { GridComponent, ColumnsDirective, ColumnDirective, Page, Filter, Sort, Toolbar, Inject } from '@syncfusion/ej2-react-grids';
import { Badge } from '@/components/ui/badge';
import { Trophy, TrendingUp, Target } from 'lucide-react';
import { ListSwitcher } from '@/components/list-switcher';

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
  soloQueue: RankData | null;
  flexQueue: RankData | null;
  peakRank: RankData | null;
}

export default function LeaderboardPage() {
  const { data: session } = useSession();
  const [bootcampers, setBootcampers] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
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

  const positionTemplate = (props: LeaderboardEntry) => {
    // Find the actual position in the bootcampers array
    const position = bootcampers.findIndex(b => b.id === props.id) + 1;
    
    const positionColors: Record<number, string> = {
      1: 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-white',
      2: 'bg-gradient-to-br from-gray-300 to-gray-500 text-white',
      3: 'bg-gradient-to-br from-amber-600 to-amber-800 text-white',
    };
    
    const bgClass = positionColors[position] || 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    
    return (
      <div className="flex items-center justify-center">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${bgClass}`}>
          {position}
        </div>
      </div>
    );
  };

  const summonerTemplate = (props: LeaderboardEntry) => {
    return (
      <div className="flex items-center gap-3 justify-center">
        <div className="flex flex-col">
          <span className="font-medium text-lg">{props.name || props.summonerName}</span>
          {props.riotId && (
            <span className="text-xs text-gray-500">{props.riotId}</span>
          )}
        </div>
      </div>
    );
  };

  const roleTemplate = (props: LeaderboardEntry) => {
    if (!props.role) return <span className="text-gray-400">—</span>;
    
    const roleColors: Record<string, string> = {
      pro: 'bg-yellow-500',
      streamer: 'bg-purple-500',
      rookie: 'bg-blue-500',
    };
    
    return (
      <Badge className={roleColors[props.role] || ''}>
        {props.role.charAt(0).toUpperCase() + props.role.slice(1)}
      </Badge>
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
    const color = winRate >= 60 ? 'text-green-600' : winRate >= 50 ? 'text-yellow-600' : 'text-red-600';
    
    return (
      <div className="flex items-center gap-2 justify-center">
        <span className={`font-semibold ${color}`}>
          {winRate.toFixed(1)}%
        </span>
        <span className="text-gray-500 text-sm">
          ({rank.wins}W {rank.losses}L)
        </span>
      </div>
    );
  };

  const statusTemplate = (props: LeaderboardEntry) => {
    const isLive = props.status === 'in_game';
    
    return (
      <div className="flex gap-2 justify-center">
        {isLive ? (
          <Badge variant="destructive">In Game</Badge>
        ) : (
          <Badge variant="secondary">Idle</Badge>
        )}
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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
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
          <div className="card-modern p-6 text-center group">
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

          <div className="card-modern p-6 text-center group">
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="p-2 rounded-full bg-green-500/10">
                <TrendingUp className="h-6 w-6 text-green-500" />
              </div>
            </div>
            <p className="text-sm text-gray-400 mb-1">Highest Win Rate</p>
            <p className="text-xl font-bold text-white mb-1">{mostGames?.name || highestWinRate?.summonerName || '—'}</p>
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
            dataSource={bootcampers}
            allowPaging={true}
            allowSorting={true}
            pageSettings={{ pageSize: 20 }}
            toolbar={['Search']}
            height={600}
            enableHover={true}
          >
          <ColumnsDirective>
            <ColumnDirective
              headerText="#"
              width="80"
              textAlign="Center"
              template={positionTemplate}
              allowSorting={false}
            />
            <ColumnDirective
              field="summonerName"
              headerText="Player"
              width="250"
              textAlign="Center"
              template={summonerTemplate}
            />
            <ColumnDirective
              field="role"
              headerText="Role"
              width="120"
              textAlign="Center"
              template={roleTemplate}
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
              width="180"
              textAlign="Center"
              template={peakRankTemplate}
            />
            <ColumnDirective
              field="soloQueue.winRate"
              headerText="Win Rate"
              width="200"
              textAlign="Center"
              template={winRateTemplate}
            />
            <ColumnDirective
              field="status"
              headerText="Status"
              width="120"
              textAlign="Center"
              template={statusTemplate}
            />
          </ColumnsDirective>
          <Inject services={[Page, Filter, Sort, Toolbar]} />
        </GridComponent>
        </div>
      </div>
    </div>
  );
}
