'use client';

import { useState } from 'react';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const formSchema = z.object({
  name: z.string().optional(),
  summonerName: z.string().min(1, 'Summoner name is required'),
  region: z.string().min(1, 'Region is required'),
  twitchLogin: z.string().optional(),
  role: z.enum(['pro', 'streamer', 'rookie']).optional(),
  startDate: z.string().min(1, 'Start date is required'),
  plannedEndDate: z.string().min(1, 'End date is required'),
});

interface AddBootcamperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  currentList?: 'default' | 'user';
}

export function AddBootcamperDialog({
  open,
  onOpenChange,
  onSuccess,
  currentList = 'user',
}: AddBootcamperDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      summonerName: '',
      region: 'kr',
      twitchLogin: '',
      startDate: new Date().toISOString().split('T')[0],
      plannedEndDate: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      const payload = { ...values, listType: currentList };
      console.log('Adding bootcamper with payload:', payload);
      console.log('currentList prop value:', currentList);
      
      const response = await fetch('/api/bootcampers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add bootcamper');
      }

      const bootcamper = await response.json();
      
      // Subscribe to Twitch EventSub if Twitch login was provided
      if (values.twitchLogin) {
        try {
          console.log('Subscribing to Twitch EventSub for bootcamper:', bootcamper.id);
          const eventSubResponse = await fetch(`/api/bootcampers/${bootcamper.id}/twitch-subscribe`, {
            method: 'POST',
          });
          
          if (!eventSubResponse.ok) {
            const eventSubError = await eventSubResponse.json();
            console.error('Twitch EventSub subscription failed:', eventSubError);
            // Don't throw here - bootcamper was created successfully, just subscription failed
            alert(`Bootcamper created successfully, but Twitch notifications setup failed: ${eventSubError.error}`);
          } else {
            const eventSubResult = await eventSubResponse.json();
            console.log('Twitch EventSub subscription result:', eventSubResult);
            
            if (eventSubResult.message && eventSubResult.message.includes('development mode')) {
              console.log('Twitch EventSub skipped in development mode');
            } else {
              console.log('Twitch EventSub subscription successful');
            }
          }
        } catch (err) {
          console.error('Failed to subscribe to Twitch EventSub:', err);
          // Don't throw here - bootcamper was created successfully, just subscription failed
          alert('Bootcamper created successfully, but Twitch notifications setup failed');
        }
      }

      form.reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error adding bootcamper:', error);
      alert(error instanceof Error ? error.message : 'Failed to add bootcamper');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Bootcamper</DialogTitle>
          <DialogDescription>
            Add a new bootcamper to track their games and streams.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Doublelift, Faker, etc." {...field} />
                  </FormControl>
                  <FormDescription>
                    The person&apos;s real name or preferred display name
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="summonerName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Riot ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Hide on bush#KR1" {...field} />
                  </FormControl>
                  <FormDescription>
                    Format: GameName#TAG (e.g., &quot;Hide on bush#KR1&quot;)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="region"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Region</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select region" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="kr">Korea (KR)</SelectItem>
                      <SelectItem value="na1">North America (NA)</SelectItem>
                      <SelectItem value="euw1">Europe West (EUW)</SelectItem>
                      <SelectItem value="eun1">Europe Nordic & East (EUNE)</SelectItem>
                      <SelectItem value="br1">Brazil (BR)</SelectItem>
                      <SelectItem value="jp1">Japan (JP)</SelectItem>
                      <SelectItem value="la1">Latin America North (LAN)</SelectItem>
                      <SelectItem value="la2">Latin America South (LAS)</SelectItem>
                      <SelectItem value="oc1">Oceania (OCE)</SelectItem>
                      <SelectItem value="tr1">Turkey (TR)</SelectItem>
                      <SelectItem value="ru">Russia (RU)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="twitchLogin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Twitch Username (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="faker" {...field} />
                  </FormControl>
                  <FormDescription>
                    Link their Twitch account to track streams
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="pro">Pro Player</SelectItem>
                      <SelectItem value="streamer">Streamer</SelectItem>
                      <SelectItem value="rookie">Rookie</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
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
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Adding...' : 'Add Bootcamper'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
