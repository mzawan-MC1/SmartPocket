'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" className="btn-primary" onClick={() => reset()}>
                Try again
              </button>
              <Link className="btn-secondary" href="/home">
                Go to Home
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

