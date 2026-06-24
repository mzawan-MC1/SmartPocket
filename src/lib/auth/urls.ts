import type { NextRequest } from 'next/server';
import { getSafeNextPath } from '@/lib/auth/redirects';

const LOCAL_DEV_ORIGIN = 'http://localhost:4028';
const PRODUCTION_CANONICAL_ORIGIN = 'https://1smartpocket.com';

function normalizeOrigin(value?: string | null) {
  if (!value) return null;
  return value.replace(/\/+$/, '');
}

function canonicalizeOrigin(origin: string | null) {
  if (!origin) return null;

  try {
    const url = new URL(origin);
    if (process.env.NODE_ENV === 'production') {
      url.protocol = 'https:';
      url.hostname = '1smartpocket.com';
      url.port = '';
      return url.origin;
    }

    if (url.hostname === 'www.1smartpocket.com') {
      url.hostname = '1smartpocket.com';
      return url.origin;
    }

    return url.origin;
  } catch {
    return origin;
  }
}

function isLocalHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isIpHostname(hostname: string) {
  const normalized = hostname.replace(/^\[(.*)\]$/, '$1');
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized) || normalized.includes(':');
}

function getTrustedRequestOrigin(request: Pick<NextRequest, 'headers' | 'nextUrl'>) {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const host = forwardedHost || request.headers.get('host');
  const proto = forwardedProto || request.nextUrl.protocol.replace(/:$/, '');

  if (!host || !proto) {
    return null;
  }

  try {
    const origin = new URL(`${proto}://${host}`).origin;
    const hostname = new URL(origin).hostname;
    if (isLocalHostname(hostname) || isIpHostname(hostname)) {
      return null;
    }
    return normalizeOrigin(origin);
  } catch {
    return null;
  }
}

function getConfiguredSiteOrigin() {
  return canonicalizeOrigin(
    normalizeOrigin(
      process.env.NEXT_PUBLIC_SITE_URL
      || process.env.NEXT_PUBLIC_APP_URL
      || process.env.APP_URL
    )
  );
}

export function getAppOrigin() {
  const configuredOrigin = getConfiguredSiteOrigin();

  if (process.env.NODE_ENV === 'production') {
    return configuredOrigin || PRODUCTION_CANONICAL_ORIGIN;
  }

  if (typeof window !== 'undefined') {
    return normalizeOrigin(window.location.origin) || configuredOrigin || LOCAL_DEV_ORIGIN;
  }

  return configuredOrigin || LOCAL_DEV_ORIGIN;
}

export function getPublicOrigin(request?: Pick<NextRequest, 'headers' | 'nextUrl'>) {
  const configuredOrigin = getConfiguredSiteOrigin();

  if (process.env.NODE_ENV === 'production') {
    return configuredOrigin || PRODUCTION_CANONICAL_ORIGIN;
  }

  if (configuredOrigin) {
    return configuredOrigin;
  }

  if (request) {
    const trustedRequestOrigin = getTrustedRequestOrigin(request);
    if (trustedRequestOrigin) {
      return trustedRequestOrigin;
    }
  }

  if (request) {
    return normalizeOrigin(request.nextUrl.origin) || LOCAL_DEV_ORIGIN;
  }

  return getAppOrigin();
}

export function buildAppUrl(path: string, request?: Pick<NextRequest, 'headers' | 'nextUrl'>) {
  return new URL(path, getPublicOrigin(request));
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
