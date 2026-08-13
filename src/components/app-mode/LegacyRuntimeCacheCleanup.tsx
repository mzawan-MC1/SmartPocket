'use client';

import { useEffect } from 'react';
import { runLegacyRuntimeCleanup } from '@/lib/runtime-cache';

function isSecureContextForSW(locationOrigin: string) {
  if (locationOrigin.startsWith('https:')) return true;
  if (locationOrigin.startsWith('chrome-extension:')) return false;
  // Allow localhost / 127.0.0.1 / [::1] for local Next.js development.
  try {
    const url = new URL(locationOrigin + '/');
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

export default function LegacyRuntimeCacheCleanup() {
  useEffect(() => {
    void runLegacyRuntimeCleanup().then(() => {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
      if (!isSecureContextForSW(window.location.origin)) return;
      const scriptUrl = `${window.location.origin}/sw.js`;
      const sameOrigin = (() => {
        try {
          return new URL(scriptUrl).origin === window.location.origin;
        } catch {
          return false;
        }
      })();
      if (!sameOrigin) return;
      void navigator.serviceWorker.register(scriptUrl, {
        scope: '/',
        updateViaCache: 'imports',
      }).catch(() => {
        // Swallow registration failures so the normal page path stays intact.
        // HTTPS-only requirement means store packaging and production pass,
        // while certain dev hosts (LAN IPs, non-localhost) correctly skip.
      });
    }).catch(() => {
      // Ignore cleanup failures and leave the normal page path intact.
    });
  }, []);

  return null;
}
