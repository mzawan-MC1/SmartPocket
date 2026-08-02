'use client';

import type { Session } from '@supabase/supabase-js';
import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isTauriNativeShellRuntime } from '@/lib/app-runtime';

const DESKTOP_CHUNK_RELOAD_KEY = 'smartpocket.desktop.chunk-reload-once';

function isDesktopChunkLoadError(error: Error & { digest?: string }) {
  const name = String(error?.name || '');
  const message = String(error?.message || '');
  const digest = String(error?.digest || '');
  const haystack = `${name} ${message} ${digest}`.toLowerCase();

  return haystack.includes('chunkloaderror')
    || haystack.includes('loading chunk')
    || haystack.includes('failed to fetch dynamically imported module')
    || haystack.includes('importing a module script failed');
}

async function clearDesktopRuntimeCaches() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(registrations.map((registration) => registration.unregister()));
  }

  if ('caches' in window) {
    const cacheKeys = await caches.keys();
    await Promise.allSettled(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
  }
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDesktopRuntime = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return isTauriNativeShellRuntime();
  }, []);
  const [hasValidSession, setHasValidSession] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      if (process.env.NEXT_PUBLIC_SP_DEBUG !== '1') return;
      const url =
        process.env.NEXT_PUBLIC_SP_DEBUG_URL
        || `http://${window.location.hostname}:7777/event`;
      const body = JSON.stringify({
        sessionId: 'home-first-visit-blank',
        ts: Date.now(),
        source: 'global-error',
        point: 'global-error-rendered',
        errorName: error?.name || 'Error',
        errorMessage: error?.message || '',
        digest: error?.digest || null,
      });
      if ('sendBeacon' in navigator) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        return;
      }
      void fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      });
    } catch {}
  }, [error]);

  useEffect(() => {
    if (!isDesktopRuntime || typeof window === 'undefined') {
      return;
    }

    console.error('[desktop global-error]', {
      errorName: error?.name || 'Error',
      errorMessage: error?.message || '',
      digest: error?.digest || null,
      currentUrl: window.location.href,
    });
  }, [error, isDesktopRuntime]);

  useEffect(() => {
    if (!isDesktopRuntime) {
      return;
    }

    let cancelled = false;

    void createClient().auth.getSession()
      .then((sessionResult: { data: { session: Session | null }; error: Error | null }) => {
        if (cancelled) {
          return;
        }

        setHasValidSession(!sessionResult.error && Boolean(sessionResult.data.session?.user));
      })
      .catch(() => {
        if (!cancelled) {
          setHasValidSession(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isDesktopRuntime]);

  useEffect(() => {
    if (!isDesktopRuntime || typeof window === 'undefined') {
      return;
    }

    if (!isDesktopChunkLoadError(error)) {
      return;
    }

    if (window.sessionStorage.getItem(DESKTOP_CHUNK_RELOAD_KEY) === '1') {
      return;
    }

    window.sessionStorage.setItem(DESKTOP_CHUNK_RELOAD_KEY, '1');
    void clearDesktopRuntimeCaches()
      .catch(() => {
        // Ignore cache cleanup failures and still retry once.
      })
      .finally(() => {
        window.location.reload();
      });
  }, [error, isDesktopRuntime]);

  const handleTryAgain = () => {
    if (isDesktopRuntime && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }

    reset();
  };

  const handleGoHome = () => {
    if (typeof window === 'undefined') {
      return;
    }

    if (isDesktopRuntime) {
      window.location.replace(hasValidSession ? '/dashboard?desktop=1' : '/sign-up-login?desktop=1');
      return;
    }

    window.location.replace('/home');
  };

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-background text-foreground">
          <div className="mx-auto max-w-3xl px-6 py-16">
            <div className="space-y-2">
              <h1 className="text-2xl font-800 tracking-tight">Smart Pocket</h1>
              <p className="text-sm text-muted-foreground">
                We couldn&apos;t load this page. Please try again.
              </p>
            </div>
            {isDesktopRuntime ? (
              <div className="mt-4 rounded-2xl border border-border bg-card px-4 py-3 text-left">
                <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                  Desktop diagnostics
                </p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="font-600 text-foreground">Error name</dt>
                    <dd className="break-words text-muted-foreground">{error?.name || 'Error'}</dd>
                  </div>
                  <div>
                    <dt className="font-600 text-foreground">Error message</dt>
                    <dd className="break-words text-muted-foreground">{error?.message || 'Unknown error'}</dd>
                  </div>
                  <div>
                    <dt className="font-600 text-foreground">Digest</dt>
                    <dd className="break-words text-muted-foreground">{error?.digest || 'Unavailable'}</dd>
                  </div>
                  <div>
                    <dt className="font-600 text-foreground">Current URL</dt>
                    <dd className="break-all text-muted-foreground">
                      {typeof window !== 'undefined' ? window.location.href : 'Unavailable'}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" className="btn-primary" onClick={handleTryAgain}>
                Try again
              </button>
              <button type="button" className="btn-secondary" onClick={handleGoHome}>
                Go to Home
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
