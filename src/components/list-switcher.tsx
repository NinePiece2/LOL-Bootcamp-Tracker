'use client';

import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';

interface ListSwitcherProps {
  currentList: 'default' | 'user';
  onSwitch: (listType: 'default' | 'user') => void;
}

export function ListSwitcher({ currentList, onSwitch }: ListSwitcherProps) {
  const { data: session } = useSession();

  if (!session?.user) {
    return null;
  }

  // Regular users only see their own list
  if (!session.user.isAdmin) {
    return (
      <div className="flex items-center gap-2 p-1 bg-gray-900 rounded-lg border border-gray-800">
        <Button
          size="sm"
          variant="default"
          disabled
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          My List
        </Button>
      </div>
    );
  }

  // Admins can see both lists
  return (
    <div className="flex items-center gap-2 p-1 bg-gray-900 rounded-lg border border-gray-800">
      <Button
        size="sm"
        variant={currentList === 'default' ? 'default' : 'ghost'}
        onClick={() => onSwitch('default')}
        className={
          currentList === 'default'
            ? 'bg-purple-600 hover:bg-purple-700 text-white'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'
        }
      >
        Default List
      </Button>
      <Button
        size="sm"
        variant={currentList === 'user' ? 'default' : 'ghost'}
        onClick={() => onSwitch('user')}
        className={
          currentList === 'user'
            ? 'bg-purple-600 hover:bg-purple-700 text-white'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'
        }
      >
        My List
      </Button>
    </div>
  );
}
