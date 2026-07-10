'use client';

import React from 'react';
import { Bell, Home, Search, Sparkles } from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import { useLanguage } from '@/contexts/LanguageContext';

export default function AppModeShell({ children }: { children: React.ReactNode }) {
  const { dir } = useLanguage();

  return (
    <div
      className="min-h-screen min-h-[100dvh] bg-background text-foreground"
      dir={dir}
      data-app-runtime="native-shell"
    >
      <div className="flex min-h-screen min-h-[100dvh] flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90">
          <div
            className="mx-auto flex w-full max-w-screen-md items-center justify-between gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
            aria-hidden="true"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-background shadow-card-sm">
                <AppLogo size={26} />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-24 rounded-full bg-secondary" />
                <div className="h-2.5 w-16 rounded-full bg-secondary/80" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                <Bell size={17} />
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                <Sparkles size={17} />
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden">
          {children}
        </main>

        <div className="sticky bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90">
          <div
            className="mx-auto grid w-full max-w-screen-md grid-cols-3 gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3"
            aria-hidden="true"
          >
            {[Home, Search, Sparkles].map((Icon, index) => (
              <div
                key={index}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2.5 shadow-card-sm"
              >
                <Icon size={18} className="text-muted-foreground" />
                <div className="h-2 w-10 rounded-full bg-secondary" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
