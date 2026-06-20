'use client';
import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Menu, X, Settings, LogOut, Shield, Sparkles, HelpCircle } from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import SearchField from '@/components/ui/SearchField';
import NotificationBell from '@/components/NotificationBell';
import { useQuickActions } from '@/components/quick-actions/QuickActionsContext';

interface TopbarProps {
  onToggleSidebar: () => void;
}

export default function Topbar({ onToggleSidebar }: TopbarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { user, signOut } = useAuth();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const quickActions = useQuickActions();

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
      <div className="page-shell flex min-h-[72px] w-full flex-wrap items-center gap-3 py-3 max-[480px]:min-h-[60px] max-[480px]:gap-1.5 max-[480px]:py-2 sm:gap-4 sm:py-3.5">
        {/* Mobile menu toggle */}
        <button
          onClick={onToggleSidebar}
          className="btn-ghost h-10 w-10 p-0 max-[480px]:flex max-[480px]:h-10 max-[480px]:w-10 max-[480px]:items-center max-[480px]:justify-center max-[480px]:rounded-xl max-[480px]:border max-[480px]:border-border/80 max-[480px]:bg-secondary/55 lg:hidden"
          aria-label="Toggle menu"
        >
          <Menu size={20} className="max-[480px]:text-foreground" />
        </button>

        {/* Search */}
        <div className={`order-last basis-full transition-all duration-200 max-[480px]:pt-1 sm:order-none sm:basis-auto sm:flex-1 sm:pe-2 ${searchOpen ? 'flex' : 'hidden sm:flex'}`}>
          <SearchField
            placeholder="Search transactions, accounts..."
            wrapperClassName="max-w-none sm:max-w-[28rem] lg:max-w-[34rem] xl:max-w-[40rem]"
            inputClassName="border-border/90 bg-secondary/60 max-[480px]:h-9"
          />
        </div>

        {/* Mobile search toggle */}
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className="btn-ghost h-10 w-10 p-0 max-[480px]:flex max-[480px]:h-10 max-[480px]:w-10 max-[480px]:items-center max-[480px]:justify-center max-[480px]:rounded-xl max-[480px]:border max-[480px]:border-border/80 max-[480px]:bg-secondary/55 sm:hidden"
          aria-label="Search"
        >
          {searchOpen ? <X size={19} className="text-foreground" /> : <Search size={19} className="text-foreground" />}
        </button>

        <div className="ms-auto flex min-w-0 shrink-0 items-center gap-2 max-[480px]:gap-1.5 sm:gap-2.5">
          {/* AI Smart Entry button */}
          <button
            onClick={() => quickActions?.openQuickAction('smart_entry')}
            className="hidden h-10 min-w-[156px] items-center justify-center gap-1.5 rounded-xl border border-purple-200 bg-ai-soft px-4 text-sm font-700 text-ai transition-colors hover:bg-purple-100 sm:inline-flex"
            aria-label="AI Smart Entry"
            title="Smart Entry (AI)"
          >
            <Sparkles size={14} />
            <span className="hidden lg:inline">Smart Entry</span>
          </button>

          {/* Mobile AI button */}
          <button
            onClick={() => quickActions?.openQuickAction('smart_entry')}
            className="btn-ghost h-10 w-10 p-0 max-[480px]:flex max-[480px]:h-10 max-[480px]:w-10 max-[480px]:items-center max-[480px]:justify-center max-[480px]:rounded-full max-[480px]:border max-[480px]:border-accent/20 max-[480px]:bg-accent/12 sm:hidden"
            aria-label="AI Smart Entry"
          >
            <Sparkles size={23} className="text-accent" />
          </button>

          {/* Language Switcher */}
          <LanguageSwitcher variant="compact" />

          <NotificationBell />

          {/* User Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex h-10 items-center gap-2 rounded-xl border border-transparent bg-transparent px-2.5 max-[480px]:h-10 max-[480px]:gap-1 max-[480px]:rounded-xl max-[480px]:px-1.5 hover:border-border hover:bg-secondary/50"
              aria-label="User menu"
              aria-expanded={userMenuOpen}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full gradient-teal text-xs font-700 text-white max-[480px]:h-7 max-[480px]:w-7">
                {initials}
              </div>
              <span className="hidden max-w-[120px] truncate text-sm font-600 text-foreground lg:block">{displayName}</span>
              <ChevronDown size={14} className={`hidden text-muted-foreground transition-transform duration-150 lg:block ${userMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {userMenuOpen && (
              <div className="absolute end-0 top-full z-50 mt-2 w-52 max-w-[calc(100vw-1rem)] scale-in rounded-xl border border-border bg-card py-1 shadow-card-lg">
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
                  href="/help"
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <HelpCircle size={14} className="text-muted-foreground" />
                  Help & Support
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
    </header>
  );
}
