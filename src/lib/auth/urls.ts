import { getSafeNextPath } from '@/lib/auth/redirects';

const LOCAL_DEV_ORIGIN = 'http://localhost:4028';

function normalizeOrigin(value?: string | null) {
  if (!value) return null;
  return value.replace(/\/+$/, '');
}

function getConfiguredSiteOrigin() {
  return normalizeOrigin(
    process.env.NEXT_PUBLIC_SITE_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || process.env.APP_URL
  );
}

export function getAppOrigin() {
  const configuredOrigin = getConfiguredSiteOrigin();

  if (process.env.NODE_ENV === 'production') {
    if (!configuredOrigin) {
      throw new Error('NEXT_PUBLIC_SITE_URL is required in production');
    }

    return configuredOrigin;
  }

  if (typeof window !== 'undefined') {
    return normalizeOrigin(window.location.origin) || configuredOrigin || LOCAL_DEV_ORIGIN;
  }

  return configuredOrigin || LOCAL_DEV_ORIGIN;
}

export function buildAuthCallbackUrl(next?: string | null) {
  const callbackUrl = new URL('/api/auth/callback', getAppOrigin());
  const safeNext = getSafeNextPath(next ?? null);

  if (safeNext) {
    callbackUrl.searchParams.set('next', safeNext);
  }

  return callbackUrl.toString();
}

export function buildPasswordResetUrl() {
  return new URL('/auth/reset-password', getAppOrigin()).toString();
}
