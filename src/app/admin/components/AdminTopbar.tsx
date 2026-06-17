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
    <header className="z-20 shrink-0 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90">
      <div className="page-shell flex min-h-[68px] w-full items-center gap-3 py-3">
        <button onClick={onToggleSidebar} className="lg:hidden btn-ghost h-10 w-10 p-0" aria-label="Toggle menu">
          <Menu size={20} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-800 uppercase tracking-[0.18em] text-muted-foreground">
            ADMIN PORTAL
          </p>
          <p className="mt-0.5 truncate text-sm font-800 uppercase tracking-[0.08em] text-foreground sm:text-base">
            {branding.appName} ADMIN
          </p>
        </div>
      </div>
    </header>
  );
}
