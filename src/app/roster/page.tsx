'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { GridComponent, ColumnsDirective, ColumnDirective, Page, Filter, Sort, Toolbar, Inject } from '@syncfusion/ej2-react-grids';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AddBootcamperDialog } from '@/components/add-bootcamper-dialog';
import { EditBootcamperDialog } from '@/components/edit-bootcamper-dialog';
import { SelectBootcamperDialog } from '@/components/select-bootcamper-dialog';
import { ListSwitcher } from '@/components/list-switcher';
import { GameProfileLinks } from '@/components/game-profile-links';
import { format } from 'date-fns';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface Game {
  id: string;
  status: string;
}

interface TwitchStream {
  id: string;
  live: boolean;
}

interface Bootcamper {
  id: string;
  name?: string | null;
  summonerName: string;
  riotId?: string | null;
  region: string;
  twitchLogin: string | null;
  role: string | null;
  status: string;
  startDate: string;
  plannedEndDate: string;
  actualEndDate: string | null;
  games: Game[];
  twitchStreams: TwitchStream[];
  userAssociationId?: string | null;
  userId?: string | null;
}

export default function RosterPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [bootcampers, setBootcampers] = useState<Bootcamper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSelectDialog, setShowSelectDialog] = useState(false);
  const [editingBootcamper, setEditingBootcamper] = useState<Bootcamper | null>(null);
  const { toast } = useToast();
  
  // Set initial list based on user permissions
  const getInitialList = (): 'default' | 'user' => {
    if (!session?.user) return 'default';
    return session.user.isAdmin ? 'default' : 'user';
  };
  
  const [currentList, setCurrentList] = useState<'default' | 'user'>(getInitialList());

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  // Update currentList when session changes
  useEffect(() => {
    if (session?.user) {
      const newList = session.user.isAdmin ? 'default' : 'user';
      setCurrentList(newList);
    }
  }, [session?.user]);

  const fetchBootcampers = useCallback(async () => {
    try {
      const listType = session?.user ? currentList : 'default';
      const response = await fetch(`/api/bootcampers?listType=${listType}`);
      const data = await response.json();
      setBootcampers(data);
    } catch (error) {
      console.error('Error fetching bootcampers:', error);
    } finally {
      setIsLoading(false);
    }
  }, [session?.user, currentList]);

  useEffect(() => {
    if (session?.user) {
      fetchBootcampers();
    }
  }, [session?.user, fetchBootcampers]);

  const statusTemplate = (props: Bootcamper) => {
    const isLive = props.status === 'in_game';
    const isStreaming = props.twitchStreams && props.twitchStreams.length > 0;
    
    return (
      <div className="flex gap-2 justify-center">
        {isLive && <Badge variant="destructive">In Game</Badge>}
        {isStreaming && <Badge className="bg-purple-600">Live</Badge>}
        {!isLive && !isStreaming && <Badge variant="secondary">Idle</Badge>}
      </div>
    );
  };

  const twitchTemplate = (props: Bootcamper) => {
    if (!props.twitchLogin) return <span className="text-gray-400">—</span>;
    
    return (
      <a
        href={`https://www.twitch.tv/${props.twitchLogin}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-purple-600 hover:underline"
      >
        {props.twitchLogin}
      </a>
    );
  };

  const dateTemplate = (field: string) => {
    const DateCell = (props: Record<string, string | Date | null>) => {
      if (!props[field]) return <span className="text-gray-400">—</span>;
      return <span>{format(new Date(props[field]!), 'MMM d, yyyy')}</span>;
    };
    DateCell.displayName = `DateCell_${field}`;
    return DateCell;
  };

  const summonerTemplate = (props: Bootcamper & { riotId?: string | null }) => {
    return (
      <div className="flex items-center gap-2 justify-center">
        <div className="flex flex-col">
          <span className="font-medium">{props.name || props.summonerName}</span>
          {props.name && (
            <span className="text-xs text-gray-500">{props.summonerName}</span>
          )}
          {props.riotId && !props.name && (
            <span className="text-xs text-gray-500">{props.riotId}</span>
          )}
        </div>
        <GameProfileLinks 
          riotId={props.riotId || null}
          summonerName={props.summonerName}
          region={props.region}
          size="sm"
        />
      </div>
    );
  };

  const roleTemplate = (props: Bootcamper) => {
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

  const actionsTemplate = (props: Bootcamper) => {
    // Only admins can edit canonical/default bootcampers.
    const canEdit = Boolean(session?.user?.isAdmin);
    // Allow delete if admin OR this row is a user association owned by current user
    const canDelete = Boolean(
      session?.user?.isAdmin || (props.userAssociationId && props.userId === session?.user?.id)
    );

    return (
      <div className="flex gap-2 justify-center">
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditingBootcamper(props)}
            className="h-8 px-2"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        {canDelete && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleDelete(props.id)}
            className="h-8 px-2"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        {!canEdit && !canDelete && <span className="text-sm text-gray-400">—</span>}
      </div>
    );
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this bootcamper from your list?')) return;

  try {
      // Find bootcamper in current list to determine if this is an association
      const bc = bootcampers.find(b => b.id === id);

      let response: Response;
      if (bc && bc.userAssociationId) {
        // Delete the user association
        response = await fetch(`/api/user-bootcampers/${bc.userAssociationId}`, { method: 'DELETE' });
      } else {
        // Admin deletion of canonical bootcamper (or legacy user row)
        response = await fetch(`/api/bootcampers/${id}`, { method: 'DELETE' });
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown' }));
        throw new Error(err?.error || 'Failed to delete bootcamper');
      }

      toast({ title: 'Bootcamper removed', variant: 'success', description: 'Bootcamper removed from your list.' });
      fetchBootcampers();
    } catch (error) {
      console.error('Error deleting bootcamper:', error);
      toast({ title: 'Failed to remove', variant: 'error', description: error instanceof Error ? error.message : 'Failed to delete bootcamper' });
    }
  };

  // Determine which dialog to show based on user role and current list
  const handleAddClick = () => {
    if (session?.user?.isAdmin && currentList === 'default') {
      // Admins can create new default bootcampers
      setShowAddDialog(true);
    } else {
      // Regular users or admins on their personal list select from defaults
      setShowSelectDialog(true);
    }
  };

  const getAddButtonText = () => {
    if (session?.user?.isAdmin && currentList === 'default') {
      return 'Add New Bootcamper';
    }
    return 'Add from Default List';
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  // Show nothing while redirecting
  if (!session?.user) {
    return null;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-3xl font-bold dark:text-white">Bootcamp Roster</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Tracking {bootcampers.length} bootcampers
            </p>
          </div>
          <ListSwitcher currentList={currentList} onSwitch={setCurrentList} />
        </div>
        <Button onClick={handleAddClick} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          {getAddButtonText()}
        </Button>
      </div>

      <div className="bg-gray-900 rounded-lg shadow-lg overflow-hidden">
        <GridComponent
          dataSource={bootcampers}
          allowPaging={true}
          allowSorting={true}
          allowFiltering={true}
          pageSettings={{ pageSize: 20 }}
          toolbar={['Search']}
          height={600}
          enableHover={true}
        >
          <ColumnsDirective>
            <ColumnDirective
              field="summonerName"
              headerText="Summoner"
              width="200"
              textAlign="Center"
              template={summonerTemplate}
            />
            <ColumnDirective
              field="region"
              headerText="Region"
              width="80"
              textAlign="Center"
            />
            <ColumnDirective
              field="status"
              headerText="Status"
              width="150"
              textAlign="Center"
              template={statusTemplate}
            />
            <ColumnDirective
              field="role"
              headerText="Role"
              width="120"
              textAlign="Center"
              template={roleTemplate}
            />
            <ColumnDirective
              field="twitchLogin"
              headerText="Twitch"
              width="150"
              textAlign="Center"
              template={twitchTemplate}
            />
            <ColumnDirective
              field="startDate"
              headerText="Start Date"
              width="120"
              textAlign="Center"
              template={dateTemplate('startDate')}
            />
            <ColumnDirective
              field="plannedEndDate"
              headerText="End Date"
              width="120"
              textAlign="Center"
              template={dateTemplate('plannedEndDate')}
            />
            {(session?.user?.isAdmin || currentList === 'user') && (
              <ColumnDirective
                headerText="Actions"
                width="120"
                textAlign="Center"
                template={actionsTemplate}
                allowSorting={false}
                allowFiltering={false}
              />
            )}
          </ColumnsDirective>
          <Inject services={[Page, Filter, Sort, Toolbar]} />
        </GridComponent>
      </div>

      {/* Admin dialog for creating new bootcampers */}
      <AddBootcamperDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={fetchBootcampers}
        currentList={currentList}
      />

      {/* Selection dialog for choosing from default list */}
      <SelectBootcamperDialog
        open={showSelectDialog}
        onOpenChange={setShowSelectDialog}
        onSuccess={fetchBootcampers}
      />

      <EditBootcamperDialog
        bootcamper={editingBootcamper}
        open={!!editingBootcamper}
        onOpenChange={(open) => !open && setEditingBootcamper(null)}
        onSuccess={fetchBootcampers}
      />
    </div>
  );
}
