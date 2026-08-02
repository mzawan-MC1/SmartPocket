import React from 'react';
import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import PublicHeader from '@/components/public/PublicHeader';
import PublicFooter from '@/components/public/PublicFooter';
import { DESKTOP_MODE_COOKIE_NAME, isDesktopShellModeEnabled } from '@/lib/desktop-shell';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const isDesktopShell = isDesktopShellModeEnabled({
    userAgent: requestHeaders.get('user-agent'),
    desktopQuery: requestHeaders.get('x-sp-desktop-query'),
    desktopCookie: cookieStore.get(DESKTOP_MODE_COOKIE_NAME)?.value ?? null,
  });

  if (isDesktopShell) {
    return (
      <main className="min-h-screen bg-background flex flex-col">
        {children}
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicHeader />
      <main className="flex-1 flex flex-col">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
