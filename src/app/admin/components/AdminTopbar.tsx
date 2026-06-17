'use client';

import React from 'react';
import Link from 'next/link';
import { Menu, ArrowLeft } from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';

interface AdminTopbarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export default function AdminTopbar({ onToggleSidebar }: AdminTopbarProps) {
  const { branding } = usePlatformSettings();

  return (
    <header
      className="flex-shrink-0 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90 border-b border-border flex items-center gap-3 px-4 sm:px-6 z-20"
      style={{ height: 'var(--topbar-height)' }}
    >
      <button onClick={onToggleSidebar} className="lg:hidden btn-ghost p-2 -ml-2" aria-label="Toggle menu">
        <Menu size={20} />
      </button>

      <div className="flex-1 min-w-0 flex items-center gap-3">
        <div className="flex h-10 w-[120px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30 px-2.5">
          <AppLogo width={100} height={26} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-800 uppercase tracking-[0.16em] text-muted-foreground">
            Admin Portal
          </p>
          <p className="text-sm font-800 uppercase tracking-[0.08em] text-foreground leading-tight break-words">
            {branding.appName} Admin
          </p>
          <p className="hidden md:block text-xs text-muted-foreground mt-0.5">
            Branding, SEO, platform configuration, and monitoring
          </p>
        </div>
      </div>

      <Link
        href="/dashboard"
        className="btn-ghost px-3 py-2 text-sm font-600 flex items-center gap-2"
        aria-label="Back to My Account"
      >
        <ArrowLeft size={16} />
        <span className="hidden sm:inline">Back to My Account</span>
      </Link>
    </header>
  );
}
