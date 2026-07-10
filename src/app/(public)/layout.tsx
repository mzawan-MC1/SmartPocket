'use client';
import React, { useEffect, useState } from 'react';
import AppModeShell from '@/components/app-mode/AppModeShell';
import PublicHeader from '@/components/public/PublicHeader';
import PublicFooter from '@/components/public/PublicFooter';
import PublicBackToTop from '@/components/public/PublicBackToTop';
import { type AppRuntime, getAppRuntime } from '@/lib/app-runtime';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const [runtime, setRuntime] = useState<AppRuntime>('web');

  useEffect(() => {
    setRuntime(getAppRuntime());
  }, []);

  if (runtime === 'native-shell') {
    return <AppModeShell>{children}</AppModeShell>;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicHeader />
      <main className="flex-1">
        {children}
      </main>
      <PublicBackToTop />
      <PublicFooter />
    </div>
  );
}
