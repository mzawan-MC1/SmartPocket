'use client';

import React from 'react';
import { Menu } from 'lucide-react';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';

interface AdminTopbarProps {
  onToggleSidebar: () => void;
}

export default function AdminTopbar({ onToggleSidebar }: AdminTopbarProps) {
  const { branding } = usePlatformSettings();

  return (
    <header
      className="z-20 flex min-h-[68px] shrink-0 items-center gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/90 sm:px-6"
    >
      <button onClick={onToggleSidebar} className="lg:hidden btn-ghost p-2 -ml-2" aria-label="Toggle menu">
        <Menu size={20} />
      </button>

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-800 uppercase tracking-[0.18em] text-muted-foreground">
          ADMIN PORTAL
        </p>
        <p className="mt-0.5 truncate text-sm font-800 uppercase tracking-[0.08em] text-foreground sm:text-base">
          {branding.appName} ADMIN
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {branding.tagline}
        </p>
      </div>
    </header>
  );
}
