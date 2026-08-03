type RuntimeCleanupOptions = {
  force?: boolean;
};

const CLEANUP_VERSION = 'v2';
const CLEANUP_MARKER_KEY = 'smartpocket.legacy-runtime-cleanup.version';
const KNOWN_SMART_POCKET_CACHE_PATTERNS = [
  /^smartpocket/i,
  /^smart-pocket/i,
  /^workbox-precache/i,
  /^workbox-runtime/i,
];

function isLocalhostHostname(hostname: string) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]'
    || hostname.endsWith('.local');
}

function getRegistrationScriptUrl(registration: ServiceWorkerRegistration) {
  return registration.active?.scriptURL
    || registration.waiting?.scriptURL
    || registration.installing?.scriptURL
    || '';
}

function isLegacySmartPocketRegistration(
  registration: ServiceWorkerRegistration,
  currentOrigin: string,
  isLocalRuntime: boolean
) {
  const scope = registration.scope || '';
  const scriptUrl = getRegistrationScriptUrl(registration);

  if (!scope.startsWith(currentOrigin)) {
    return false;
  }

  if (isLocalRuntime) {
    return true;
  }

  try {
    const parsedScriptUrl = new URL(scriptUrl, currentOrigin);
    if (parsedScriptUrl.origin !== currentOrigin) {
      return false;
    }

    return /(sw|service-worker|workbox)/i.test(parsedScriptUrl.pathname);
  } catch {
    return /(sw|service-worker|workbox)/i.test(scriptUrl);
  }
}

function isKnownSmartPocketCache(cacheName: string) {
  return KNOWN_SMART_POCKET_CACHE_PATTERNS.some((pattern) => pattern.test(cacheName));
}

export async function runLegacyRuntimeCleanup(options: RuntimeCleanupOptions = {}) {
  if (typeof window === 'undefined') {
    return;
  }

  const { force = false } = options;
  const markerValue = window.localStorage.getItem(CLEANUP_MARKER_KEY);
  if (!force && markerValue === CLEANUP_VERSION) {
    return;
  }

  const currentOrigin = window.location.origin;
  const isLocalRuntime = isLocalhostHostname(window.location.hostname);
  const registrations = 'serviceWorker' in navigator
    ? await navigator.serviceWorker.getRegistrations()
    : [];
  const registrationsToRemove = registrations.filter((registration) =>
    isLegacySmartPocketRegistration(registration, currentOrigin, isLocalRuntime)
  );

  if (registrationsToRemove.length > 0) {
    await Promise.allSettled(
      registrationsToRemove.map((registration) => registration.unregister())
    );
  }

  if ('caches' in window) {
    const cacheKeys = await caches.keys();
    const cacheKeysToDelete = cacheKeys.filter((cacheKey) =>
      isKnownSmartPocketCache(cacheKey)
    );

    if (cacheKeysToDelete.length > 0) {
      await Promise.allSettled(cacheKeysToDelete.map((cacheKey) => caches.delete(cacheKey)));
    }
  }

  if (!force) {
    window.localStorage.setItem(CLEANUP_MARKER_KEY, CLEANUP_VERSION);
  }
}
