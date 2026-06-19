'use client';
import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Menu, X, Settings, LogOut, Shield, Sparkles } from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import SearchField from '@/components/ui/SearchField';
import NotificationBell from '@/components/NotificationBell';

interface TopbarProps {
  onToggleSidebar: () => void;
}

export default function Topbar({ onToggleSidebar }: TopbarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const { user, signOut } = useAuth();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const initials = displayName.charAt(0).toUpperCase();
  const isAdmin = user?.app_metadata?.role === 'admin';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/sign-up-login');
      toast.success('Signed out successfully');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  return (
    <header
      className="sticky top-0 z-20 shrink-0 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90"
    >
      <div className="page-shell flex min-h-[72px] w-full flex-wrap items-center gap-3 py-3 sm:gap-4 sm:py-3.5">
        {/* Mobile menu toggle */}
        <button
          onClick={onToggleSidebar}
          className="lg:hidden btn-ghost h-10 w-10 p-0"
          aria-label="Toggle menu"
        >
          <Menu size={20} />
        </button>

        {/* Search */}
        <div className={`order-last basis-full sm:order-none sm:basis-auto sm:flex-1 sm:pe-2 transition-all duration-200 ${searchOpen ? 'flex' : 'hidden sm:flex'}`}>
          <SearchField
            placeholder="Search transactions, accounts..."
            wrapperClassName="max-w-none sm:max-w-[28rem] lg:max-w-[34rem] xl:max-w-[40rem]"
            inputClassName="border-border/90 bg-secondary/60"
          />
        </div>

        {/* Mobile search toggle */}
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className="sm:hidden btn-ghost h-10 w-10 p-0"
          aria-label="Search"
        >
          {searchOpen ? <X size={18} /> : <Search size={18} />}
        </button>

        <div className="ms-auto flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5">
          {/* AI Smart Entry button */}
          <button
            onClick={() => setAiOpen(true)}
            className="hidden h-10 min-w-[156px] items-center justify-center gap-1.5 rounded-xl border border-purple-200 bg-ai-soft px-4 text-sm font-700 text-ai transition-colors hover:bg-purple-100 sm:inline-flex"
            aria-label="AI Smart Entry"
            title="Smart Entry (AI)"
          >
            <Sparkles size={14} />
            <span className="hidden lg:inline">Smart Entry</span>
          </button>

          {/* Mobile AI button */}
          <button
            onClick={() => setAiOpen(true)}
            className="sm:hidden btn-ghost h-10 w-10 p-0"
            aria-label="AI Smart Entry"
          >
            <Sparkles size={18} className="text-accent" />
          </button>

          {/* Language Switcher */}
          <LanguageSwitcher variant="compact" />

          <NotificationBell />

          {/* User Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex h-10 items-center gap-2 rounded-xl border border-transparent bg-transparent px-2.5 hover:border-border hover:bg-secondary/50"
              aria-label="User menu"
              aria-expanded={userMenuOpen}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full gradient-teal text-xs font-700 text-white">
                {initials}
              </div>
              <span className="hidden max-w-[120px] truncate text-sm font-600 text-foreground lg:block">{displayName}</span>
              <ChevronDown size={14} className={`hidden text-muted-foreground transition-transform duration-150 lg:block ${userMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {userMenuOpen && (
              <div className="absolute end-0 top-full z-50 mt-2 w-52 scale-in rounded-xl border border-border bg-card py-1 shadow-card-lg">
                <div className="border-b border-border px-3 py-2">
                  <p className="truncate text-sm font-600 text-foreground">{displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <Link
                  href="/settings"
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <Settings size={14} className="text-muted-foreground" />
                  Settings
                </Link>
                <Link
                  href="/ai-history"
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <Sparkles size={14} className="text-muted-foreground" />
                  AI History
                </Link>
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Shield size={14} className="text-muted-foreground" />
                    Admin Portal
                  </Link>
                )}
                <hr className="my-1 border-border" />
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-negative transition-colors hover:bg-negative-soft"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Assistant Modal */}
      {aiOpen && (
        <React.Suspense fallback={null}>
          <AIAssistantModalLazy onClose={() => setAiOpen(false)} />
        </React.Suspense>
      )}
    </header>
  );
}

// Lazy-loaded to avoid importing heavy AI components in the main bundle
const AIAssistantModalLazy = React.lazy(() => import('@/components/ai/AIAssistantModal'));
