'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { UserMenu } from './user-menu';
import { LoginDialog } from './login-dialog';
import { RegisterDialog } from './register-dialog';
import { Button } from './ui/button';

export function Navigation() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  const links = [
    { href: '/', label: 'Dashboard' },
    { href: '/roster', label: 'Roster', requiresAuth: true },
    { href: '/leaderboard', label: 'Leaderboard' },
  ];

  const visibleLinks = links.filter(link => !link.requiresAuth || session?.user);

  const handleSwitchToRegister = () => {
    setShowLogin(false);
    setShowRegister(true);
  };

  const handleSwitchToLogin = () => {
    setShowRegister(false);
    setShowLogin(true);
  };

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-gray-800/50 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2 text-white hover:text-gray-200 transition-colors">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-400 flex items-center justify-center">
                  <span className="text-xs font-bold text-black">TKR</span>
                </div>
                <span className="text-lg font-semibold tracking-tight">
                  LoL Bootcamp
                </span>
              </Link>
              <div className="hidden md:flex items-center gap-1">
                {visibleLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'relative px-4 py-2 text-sm font-medium transition-all duration-200 rounded-lg',
                      pathname === link.href
                        ? 'text-white bg-gray-800/60'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800/40'
                    )}
                  >
                    {link.label}
                    {pathname === link.href && (
                      <div className="absolute inset-x-1 -bottom-px h-px bg-gradient-to-r from-emerald-500 to-emerald-400" />
                    )}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {session?.user ? (
                <UserMenu user={session.user} />
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setShowLogin(true)}
                    className="text-gray-300 hover:text-white hover:bg-gray-800"
                  >
                    Sign In
                  </Button>
                  <Button
                    onClick={() => setShowRegister(true)}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    Sign Up
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      <LoginDialog
        open={showLogin}
        onOpenChange={setShowLogin}
        onSwitchToRegister={handleSwitchToRegister}
      />
      <RegisterDialog
        open={showRegister}
        onOpenChange={setShowRegister}
        onSwitchToLogin={handleSwitchToLogin}
      />
    </>
  );
}
