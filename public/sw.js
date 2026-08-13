/*
  Smart Pocket — minimal store-installable PWA service worker.

  POLICY: NETWORK-ONLY (explicitly no caching anywhere).
  - Do NOT cache /api, /auth, Supabase calls, AI calls, uploads,
    protected routes, or dynamic pages.
  - No Workbox / offline shell / precache manifest.
  - No IndexedDB writes, no cache storage manipulation.
  - Only activates + claims clients and passes every fetch straight
    to the network so behavior remains identical to the non-SW web app.
  - This file exists so Chromium PWA installability (and PWABuilder
    Store packaging) sees a registered service worker with a fetch
    handler, without changing any user-facing network behaviour.
*/

const SMARTPOCKET_SW_VERSION = 'v1-store-network-only';

self.addEventListener('install', (event) => {
  void event;
  // Skip waiting so a newly installed SW activates on next navigation.
  // No precache.
  try { self.skipWaiting(); } catch (_) { /* noop */ }
});

self.addEventListener('activate', (event) => {
  void event;
  // Claim uncontrolled tabs so the SW handles navigation fetches
  // for clients opened before this SW was installed.
  try {
    event.waitUntil(Promise.resolve().then(() => self.clients.claim()));
  } catch (_) { /* noop */ }
});

self.addEventListener('message', (event) => {
  if (!event) return;
  // Support skipWaiting message from page / devtools.
  if (event.data === 'SKIP_WAITING') {
    try { self.skipWaiting(); } catch (_) { /* noop */ }
  }
});

self.addEventListener('fetch', (event) => {
  if (!event || !event.request) return;

  // STRICT NETWORK-ONLY for every request.
  // No cache.match, no caches.open, no cache.put.
  // Let the browser's normal HTTP cache/network stack do its job.
  try {
    event.respondWith(
      (async function networkOnlyFetch() {
        return await fetch(event.request);
      })()
    );
  } catch (_) {
    // If respondWith registration throws (e.g. non-subresource request),
    // let the browser handle it natively.
    try {
      event.respondWith(fetch(event.request));
    } catch (_final) { /* noop */ }
  }
});

// Keep ESLint/linters calm if any are run on this file.
// SMARTPOCKET_SW_VERSION is referenced here so minifiers do not strip it.
void SMARTPOCKET_SW_VERSION;
