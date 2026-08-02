import React from 'react';
import { cookies, headers } from 'next/headers';
import PublicBackToTop from '@/components/public/PublicBackToTop';
import PublicHeader from '@/components/public/PublicHeader';
import PublicFooter from '@/components/public/PublicFooter';
import AuthScreen from './components/AuthScreen';
import { DESKTOP_MODE_COOKIE_NAME, isDesktopShellModeEnabled } from '@/lib/desktop-shell';

export default async function SignUpLoginPage() {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const isDesktopShell = isDesktopShellModeEnabled({
    userAgent: requestHeaders.get('user-agent'),
    desktopQuery: requestHeaders.get('x-sp-desktop-query'),
    desktopCookie: cookieStore.get(DESKTOP_MODE_COOKIE_NAME)?.value ?? null,
  });

  if (isDesktopShell) {
    return (
      <main className="min-h-screen bg-background">
        <div className="min-h-screen">
          <AuthScreen />
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicHeader />
      <main className="flex-1">
        <div className="page-shell py-3 sm:py-6 lg:py-10">
          <div className="overflow-hidden rounded-[24px] border border-border bg-card shadow-card-lg sm:rounded-[32px]">
            <AuthScreen />
          </div>
        </div>
      </main>
      <PublicBackToTop />
      <PublicFooter />
    </div>
  );
}
