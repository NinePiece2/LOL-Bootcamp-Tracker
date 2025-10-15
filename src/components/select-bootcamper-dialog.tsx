'use client';

import { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Search, User, Gamepad2, Check } from 'lucide-react';
import { useToast } from './ui/toast';

const formSchema = z.object({
  selectedBootcamperIds: z.array(z.string()).min(1, 'Please select at least one bootcamper'),
  startDate: z.string().optional(),
  plannedEndDate: z.string().optional(),
});

interface DefaultBootcamper {
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
}

interface SelectBootcamperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function SelectBootcamperDialog({
  open,
  onOpenChange,
  onSuccess,
}: SelectBootcamperDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [defaultBootcampers, setDefaultBootcampers] = useState<DefaultBootcamper[]>([]);
  const [filteredBootcampers, setFilteredBootcampers] = useState<DefaultBootcamper[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBootcampers, setSelectedBootcampers] = useState<Set<string>>(new Set());

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      selectedBootcamperIds: [],
      startDate: new Date().toISOString().split('T')[0],
      plannedEndDate: '',
    },
  });

  useEffect(() => {
    if (open) {
      (async () => {
        try {
          const defaults = await fetchDefaultBootcampers();

          const res = await fetch('/api/bootcampers?listType=user');
          if (res.ok) {
            const userList = await res.json();
            const existingDefaultIds = new Set<string>();
            userList.forEach((b: { linkedToDefaultId?: string | null }) => {
              if (b.linkedToDefaultId) existingDefaultIds.add(b.linkedToDefaultId);
            });

            // Filter out defaults that are already in the user's list
            const filteredDefaults = (defaults as DefaultBootcamper[]).filter((d) => !existingDefaultIds.has(d.id));
            setDefaultBootcampers(filteredDefaults);
            setFilteredBootcampers(filteredDefaults);

            // Clear selection since we hide already-added items
            setSelectedBootcampers(new Set());
            form.setValue('selectedBootcamperIds', []);
          } else {
            // If user list couldn't be fetched, show all defaults (best-effort)
            setDefaultBootcampers(defaults);
            setFilteredBootcampers(defaults);
            setSelectedBootcampers(new Set());
            form.setValue('selectedBootcamperIds', []);
          }
        } catch (err) {
          console.error('Error fetching default or user bootcampers for pre-selection:', err);
          setSelectedBootcampers(new Set());
          form.setValue('selectedBootcamperIds', []);
        }
      })();
    }
  }, [open, form]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredBootcampers(defaultBootcampers);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredBootcampers(
        defaultBootcampers.filter(
          (bootcamper) =>
            bootcamper.summonerName.toLowerCase().includes(query) ||
            bootcamper.name?.toLowerCase().includes(query) ||
            bootcamper.riotId?.toLowerCase().includes(query) ||
            bootcamper.twitchLogin?.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, defaultBootcampers]);

  useEffect(() => {
    form.setValue('selectedBootcamperIds', Array.from(selectedBootcampers));
  }, [selectedBootcampers, form]);

  const fetchDefaultBootcampers = async () => {
    try {
      const response = await fetch('/api/bootcampers?listType=default');
      const data = await response.json();
      setDefaultBootcampers(data);
      setFilteredBootcampers(data);
      return data;
    } catch (error) {
      console.error('Error fetching default bootcampers:', error);
      return [];
    }
  };

  const handleBootcamperToggle = (bootcamper: DefaultBootcamper) => {
    setSelectedBootcampers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(bootcamper.id)) {
        newSet.delete(bootcamper.id);
      } else {
        newSet.add(bootcamper.id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedBootcampers.size === filteredBootcampers.length) {
      setSelectedBootcampers(new Set());
    } else {
      setSelectedBootcampers(new Set(filteredBootcampers.map(b => b.id)));
    }
  };

  const { toast } = useToast();

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    
    try {
      const results: string[] = [];
      const errors: string[] = [];

      let existingUserList: Array<{ linkedToDefaultId?: string | null }> = [];
      try {
        const res = await fetch('/api/bootcampers?listType=user');
        if (res.ok) {
          existingUserList = await res.json();
        }
      } catch (err) {
        console.warn('Could not fetch user bootcampers for duplicate check:', err);
      }

      const existingDefaultIds = new Set(existingUserList.map((b) => b.linkedToDefaultId).filter(Boolean) as string[]);

      const toAdd = values.selectedBootcamperIds.filter((id) => !existingDefaultIds.has(id));
      const skipped = values.selectedBootcamperIds.length - toAdd.length;

      for (const bootcamperId of toAdd) {
        const selectedBootcamper = defaultBootcampers.find((b) => b.id === bootcamperId);
        if (!selectedBootcamper) continue;

        const startToSend = values.startDate && values.startDate.trim() ? values.startDate : selectedBootcamper.startDate;
        const plannedToSend = values.plannedEndDate && values.plannedEndDate.trim() ? values.plannedEndDate : selectedBootcamper.plannedEndDate;

        try {
          const response = await fetch('/api/bootcampers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              defaultBootcamperId: bootcamperId,
              startDate: startToSend,
              plannedEndDate: plannedToSend,
              name: selectedBootcamper.name,
              listType: 'user',
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            errors.push(`${selectedBootcamper.name || selectedBootcamper.summonerName}: ${errorData.error}`);
          } else {
            results.push(selectedBootcamper.name || selectedBootcamper.summonerName);
          }
        } catch (error) {
          errors.push(`${selectedBootcamper.name || selectedBootcamper.summonerName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      if (errors.length > 0) {
        toast({
          title: 'Add completed with errors',
          description: `Added ${results.length}. ${skipped > 0 ? `Skipped ${skipped}. ` : ''}Errors: ${errors.join('; ')}`,
          variant: 'error',
        });
      } else {
        toast({
          title: 'Bootcampers added',
          description: `Added ${results.length} bootcamper(s). ${skipped > 0 ? `Skipped ${skipped} already in your list.` : ''}`,
          variant: 'success',
        });
      }

      if (results.length > 0) {
        form.reset();
        setSelectedBootcampers(new Set());
        setSearchQuery('');
        onOpenChange(false);
        onSuccess?.();
      }
    } catch (error) {
      console.error('Error adding bootcampers:', error);
      alert('Failed to add bootcampers');
    } finally {
      setIsLoading(false);
    }
  }

  const getRoleColor = (role: string | null) => {
    const roleColors: Record<string, string> = {
      pro: 'bg-yellow-500',
      streamer: 'bg-purple-500',
      rookie: 'bg-blue-500',
    };
    return roleColors[role || ''] || 'bg-gray-500';
  };

  const getStatusColor = (status: string) => {
    return status === 'in_game' ? 'bg-red-500' : 'bg-gray-500';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const allVisible = filteredBootcampers.length > 0 && selectedBootcampers.size === filteredBootcampers.length;
  const someSelected = selectedBootcampers.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Bootcampers from Default List</DialogTitle>
          <DialogDescription>
            Select one or more bootcampers from the default list to add to your personal tracking.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search bootcampers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {filteredBootcampers.length > 0 && (
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  className="flex items-center gap-2"
                >
                  <Check className={`h-4 w-4 ${allVisible ? 'text-green-500' : 'text-gray-400'}`} />
                  {allVisible ? 'Deselect All' : 'Select All'} ({filteredBootcampers.length})
                </Button>
                <div className="text-sm text-gray-500">
                  {selectedBootcampers.size} selected
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 max-h-[300px]">
            {filteredBootcampers.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                {searchQuery ? 'No bootcampers found matching your search.' : 'No default bootcampers available.'}
              </div>
            ) : (
              filteredBootcampers.map((bootcamper) => {
                const isSelected = selectedBootcampers.has(bootcamper.id);
                
                return (
                  <Card
                    key={bootcamper.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      isSelected
                        ? 'ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                    onClick={() => handleBootcamperToggle(bootcamper)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                              isSelected 
                                ? 'bg-purple-500 border-purple-500' 
                                : 'border-gray-300 dark:border-gray-600'
                            }`}>
                              {isSelected && <Check className="h-3 w-3 text-white" />}
                            </div>
                          </div>
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                            {(bootcamper.name || bootcamper.summonerName)[0].toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {bootcamper.name || bootcamper.summonerName}
                              </span>
                              {bootcamper.name && (
                                <span className="text-sm text-gray-500">({bootcamper.summonerName})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <span className="uppercase">{bootcamper.region}</span>
                              {bootcamper.riotId && (
                                <>
                                  <span>•</span>
                                  <span>{bootcamper.riotId}</span>
                                </>
                              )}
                              {bootcamper.twitchLogin && (
                                <>
                                  <span>•</span>
                                  <span className="text-purple-600">twitch.tv/{bootcamper.twitchLogin}</span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                              <span>{formatDate(bootcamper.startDate)} - {formatDate(bootcamper.plannedEndDate)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {bootcamper.role && (
                            <Badge className={getRoleColor(bootcamper.role)}>
                              {bootcamper.role.charAt(0).toUpperCase() + bootcamper.role.slice(1)}
                            </Badge>
                          )}
                          <Badge className={getStatusColor(bootcamper.status)} variant="secondary">
                            {bootcamper.status === 'in_game' ? (
                              <div className="flex items-center gap-1">
                                <Gamepad2 className="h-3 w-3" />
                                In Game
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                Idle
                              </div>
                            )}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {someSelected && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 border-t pt-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Adding {selectedBootcampers.size} bootcamper(s) to your list
                  </div>
                  <div className="text-xs text-gray-500 mb-2">
                    You can leave the dates blank to inherit the default bootcamper&apos;s start/end dates.
                  </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="plannedEndDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Planned End Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </form>
            </Form>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={form.handleSubmit(onSubmit)}
            disabled={isLoading || selectedBootcampers.size === 0}
          >
            {isLoading ? 'Adding...' : `Add ${selectedBootcampers.size} to My List`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}