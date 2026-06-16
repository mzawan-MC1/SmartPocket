'use client';
import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, ChevronDown, Menu, X, User, Settings, LogOut, Shield, Sparkles } from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';

interface TopbarProps {
  sidebarCollapsed: boolean;
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
      className="sticky top-0 flex-shrink-0 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90 border-b border-border flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 z-20"
      style={{ minHeight: 'var(--topbar-height)' }}
    >
      {/* Mobile menu toggle */}
      <button
        onClick={onToggleSidebar}
        className="lg:hidden btn-ghost p-2 -ml-2"
        aria-label="Toggle menu"
      >
        <Menu size={20} />
      </button>

      {/* Search */}
      <div className={`order-last sm:order-none basis-full sm:basis-auto flex-1 max-w-none sm:max-w-[34rem] lg:max-w-[40rem] transition-all duration-200 ${searchOpen ? 'flex' : 'hidden sm:flex'}`}>
        <div className="relative w-full">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search transactions, accounts..."
            className="input-base ps-9 pe-4 h-11 text-sm bg-secondary/60"
          />
        </div>
      </div>

      {/* Mobile search toggle */}
      <button
        onClick={() => setSearchOpen(!searchOpen)}
        className="sm:hidden btn-ghost p-2"
        aria-label="Search"
      >
        {searchOpen ? <X size={18} /> : <Search size={18} />}
      </button>

      <div className="ms-auto flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        {/* AI Smart Entry button */}
        <button
          onClick={() => setAiOpen(true)}
          className="hidden sm:flex items-center gap-1.5 rounded-xl border border-purple-200 bg-ai-soft px-3.5 py-2.5 text-sm font-700 text-ai hover:bg-purple-100 transition-colors"
          aria-label="AI Smart Entry"
          title="Smart Entry (AI)"
        >
          <Sparkles size={14} />
          <span className="hidden md:inline">Smart Entry</span>
        </button>

        {/* Mobile AI button */}
        <button
          onClick={() => setAiOpen(true)}
          className="sm:hidden btn-ghost p-2.5"
          aria-label="AI Smart Entry"
        >
          <Sparkles size={18} className="text-accent" />
        </button>

        {/* Language Switcher */}
        <LanguageSwitcher variant="compact" />

        {/* Notifications */}
        <button className="btn-ghost p-2.5 relative" aria-label="Notifications">
          <Bell size={18} />
          <span className="absolute top-1.5 end-1.5 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-card" />
        </button>

        {/* User Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 rounded-xl border border-transparent bg-transparent px-2 py-2 hover:border-border hover:bg-secondary/50"
            aria-label="User menu"
            aria-expanded={userMenuOpen}
          >
            <div className="w-7 h-7 rounded-full gradient-teal flex items-center justify-center text-white text-xs font-700">
              {initials}
            </div>
            <span className="hidden sm:block text-sm font-600 text-foreground max-w-[120px] truncate">{displayName}</span>
            <ChevronDown size={14} className={`text-muted-foreground hidden sm:block transition-transform duration-150 ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {userMenuOpen && (
            <div className="absolute end-0 top-full mt-2 w-52 bg-card border border-border rounded-xl shadow-card-lg py-1 z-50 scale-in">
              <div className="px-3 py-2 border-b border-border">
                <p className="text-sm font-600 text-foreground truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <Link
                href="/settings"
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                onClick={() => setUserMenuOpen(false)}
              >
                <Settings size={14} className="text-muted-foreground" />
                Settings
              </Link>
              <Link
                href="/ai-history"
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                onClick={() => setUserMenuOpen(false)}
              >
                <Sparkles size={14} className="text-muted-foreground" />
                AI History
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <Shield size={14} className="text-muted-foreground" />
                  Admin Portal
                </Link>
              )}
              <hr className="my-1 border-border" />
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-negative hover:bg-negative-soft transition-colors"
              >
                <LogOut size={14} />
                Sign Out
              </button>
            </div>
          )}
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
