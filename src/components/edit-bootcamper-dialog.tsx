'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const editBootcamperSchema = z.object({
  name: z.string().optional(),
  riotId: z.string().optional(),
  twitchLogin: z.string().optional(),
  role: z.enum(['pro', 'streamer', 'rookie']).optional(),
  startDate: z.string(),
  plannedEndDate: z.string(),
  actualEndDate: z.string().optional(),
});

type EditBootcamperFormData = z.infer<typeof editBootcamperSchema>;

interface Bootcamper {
  id: string;
  name?: string | null;
  summonerName: string;
  riotId?: string | null;
  twitchLogin?: string | null;
  role?: string | null;
  startDate: Date | string;
  plannedEndDate: Date | string;
  actualEndDate?: Date | string | null;
}

interface EditBootcamperDialogProps {
  bootcamper: Bootcamper | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditBootcamperDialog({
  bootcamper,
  open,
  onOpenChange,
  onSuccess,
}: EditBootcamperDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<EditBootcamperFormData>({
    resolver: zodResolver(editBootcamperSchema),
    values: bootcamper
      ? {
          name: bootcamper.name || '',
          riotId: bootcamper.riotId || '',
          twitchLogin: bootcamper.twitchLogin || '',
          role: (bootcamper.role as 'pro' | 'streamer' | 'rookie' | null | undefined) || undefined,
          startDate: new Date(bootcamper.startDate).toISOString().split('T')[0],
          plannedEndDate: new Date(bootcamper.plannedEndDate).toISOString().split('T')[0],
          actualEndDate: bootcamper.actualEndDate
            ? new Date(bootcamper.actualEndDate).toISOString().split('T')[0]
            : '',
        }
      : undefined,
  });

  const onSubmit = async (data: EditBootcamperFormData) => {
    if (!bootcamper) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/bootcampers/${bootcamper.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          actualEndDate: data.actualEndDate || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update bootcamper');
      }

      onSuccess();
      onOpenChange(false);
      form.reset();
    } catch (error) {
      console.error('Error updating bootcamper:', error);
      alert(error instanceof Error ? error.message : 'Failed to update bootcamper');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!bootcamper) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Bootcamper</DialogTitle>
          <DialogDescription>
            Update {bootcamper.riotId || bootcamper.summonerName}&apos;s information
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Doublelift, Faker, etc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="riotId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Riot ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Hide on bush#KR1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="twitchLogin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Twitch Username</FormLabel>
                  <FormControl>
                    <Input placeholder="jankos" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
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

            <FormField
              control={form.control}
              name="actualEndDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Actual End Date (optional)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
