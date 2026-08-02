import type { NextRequest } from 'next/server';
import { getSafeNextPath } from '@/lib/auth/redirects';
import { DESKTOP_OAUTH_LAUNCH_PATH } from '@/lib/desktop-shell';

const LOCAL_DEV_ORIGIN = 'http://localhost:4028';
const PRODUCTION_CANONICAL_ORIGIN = 'https://1smartpocket.com';
const DESKTOP_AUTH_CALLBACK_URL = 'smartpocket://auth/callback';
const DESKTOP_BROWSER_COMPLETE_PATH = '/auth/desktop-browser-complete';

export type AuthUrlTarget = 'web' | 'native';

function normalizeOrigin(value?: string | null) {
  if (!value) return null;
  return value.replace(/\/+$/, '');
}

export function getConfiguredSupabaseOrigin() {
  const value = normalizeOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL ?? null);
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
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

function getConfiguredNativeAuthUrl(kind: 'password_reset') {
  const value = process.env.NEXT_PUBLIC_NATIVE_PASSWORD_RESET_URL;
  if (!value) {
    return null;
  }

  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function buildAuthFlowUrl(
  kind: 'callback' | 'password_reset',
  options?: {
    next?: string | null;
    target?: AuthUrlTarget;
  }
) {
  const target = options?.target ?? 'web';
  const safeNext = getSafeNextPath(options?.next ?? null);

  if (target === 'native' && kind === 'callback') {
    const url = new URL(DESKTOP_BROWSER_COMPLETE_PATH, PRODUCTION_CANONICAL_ORIGIN);
    if (safeNext) {
      url.searchParams.set('next', safeNext);
    }
    return url.toString();
  }

  if (target === 'native' && kind === 'password_reset') {
    const nativeUrl = getConfiguredNativeAuthUrl(kind);
    if (nativeUrl) {
      return nativeUrl;
    }
  }

  const callbackPath = kind === 'callback' ? '/api/auth/callback' : '/auth/reset-password';
  const callbackUrl = new URL(callbackPath, getAppOrigin());
  if (kind === 'callback' && safeNext) {
    callbackUrl.searchParams.set('next', safeNext);
  }

  return callbackUrl.toString();
}

export function buildAuthCallbackUrl(
  next?: string | null,
  options?: { target?: AuthUrlTarget }
) {
  return buildAuthFlowUrl('callback', {
    next,
    target: options?.target,
  });
}

export function buildPasswordResetUrl(options?: { target?: AuthUrlTarget }) {
  return buildAuthFlowUrl('password_reset', {
    target: options?.target,
  });
}

export function buildDesktopOAuthLaunchUrl(oauthUrl: string) {
  const url = new URL(DESKTOP_OAUTH_LAUNCH_PATH, getAppOrigin());
  url.searchParams.set('url', oauthUrl);
  return url.toString();
}

export function isDesktopAuthCallbackUrl(value: string | URL) {
  try {
    const url = value instanceof URL ? value : new URL(value);
    if (url.protocol !== 'smartpocket:' || url.hostname !== 'auth' || url.pathname !== '/callback') {
      return false;
    }

    const safeNext = getSafeNextPath(url.searchParams.get('next'));
    if (url.searchParams.has('next') && !safeNext) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function getSingleSearchParam(searchParams: URLSearchParams, key: string) {
  const values = searchParams.getAll(key);
  if (values.length > 1) {
    throw new Error(`Duplicate ${key} parameter.`);
  }

  return values[0] ?? null;
}

function isSafeCallbackToken(value: string) {
  return value.length > 0
    && value.length <= 64
    && /^[A-Za-z0-9_-]+$/.test(value);
}

function isSafePkceCode(value: string) {
  return value.length > 0
    && value.length <= 2048
    && /^[A-Za-z0-9._~-]+$/.test(value);
}

function isSafeSignupMethod(value: string) {
  return ['google', 'apple', 'magic_link', 'email_link'].includes(value);
}

export function buildDesktopAuthCallbackDeepLink(searchParams: URLSearchParams) {
  const code = getSingleSearchParam(searchParams, 'code');
  const error = getSingleSearchParam(searchParams, 'error');
  const errorDescription = getSingleSearchParam(searchParams, 'error_description');
  const next = getSingleSearchParam(searchParams, 'next');
  const authType = getSingleSearchParam(searchParams, 'type');
  const signupMethod = getSingleSearchParam(searchParams, 'signup_method');

  if ((code ? 1 : 0) === (error ? 1 : 0)) {
    throw new Error('The Google sign-in callback was incomplete.');
  }

  const deepLink = new URL(DESKTOP_AUTH_CALLBACK_URL);

  if (code) {
    if (!isSafePkceCode(code)) {
      throw new Error('The Google sign-in callback included an invalid code.');
    }
    deepLink.searchParams.set('code', code);
  }

  if (error) {
    if (!isSafeCallbackToken(error)) {
      throw new Error('The Google sign-in callback included an invalid error.');
    }
    deepLink.searchParams.set('error', error);
  }

  if (errorDescription) {
    deepLink.searchParams.set('error_description', errorDescription);
  }

  if (next) {
    const safeNext = getSafeNextPath(next);
    if (!safeNext) {
      throw new Error('The requested post-login page was invalid.');
    }
    deepLink.searchParams.set('next', safeNext);
  }

  if (authType) {
    if (!isSafeCallbackToken(authType)) {
      throw new Error('The Google sign-in callback included an invalid type.');
    }
    deepLink.searchParams.set('type', authType);
  }

  if (signupMethod) {
    if (!isSafeSignupMethod(signupMethod)) {
      throw new Error('The Google sign-in callback included an invalid signup method.');
    }
    deepLink.searchParams.set('signup_method', signupMethod);
  }

  return deepLink.toString();
}

export function buildDesktopBrowserCompletionUrl(next?: string | null) {
  return buildAuthCallbackUrl(next, { target: 'native' });
}

export function isDesktopBrowserCompletionUrl(value: string | URL) {
  try {
    const url = value instanceof URL ? value : new URL(value);
    if (url.origin !== PRODUCTION_CANONICAL_ORIGIN || url.pathname !== DESKTOP_BROWSER_COMPLETE_PATH) {
      return false;
    }

    const safeNext = getSafeNextPath(url.searchParams.get('next'));
    if (url.searchParams.has('next') && !safeNext) {
      return false;
    }

    const authType = url.searchParams.get('type');
    if (authType && !isSafeCallbackToken(authType)) {
      return false;
    }

    const signupMethod = url.searchParams.get('signup_method');
    if (signupMethod && !isSafeSignupMethod(signupMethod)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function isDesktopGoogleOAuthStartUrl(
  value: string | URL,
  options?: { supabaseOrigin?: string | null }
) {
  try {
    const url = value instanceof URL ? value : new URL(value);
    const expectedSupabaseOrigin = options?.supabaseOrigin ?? getConfiguredSupabaseOrigin();
    if (!expectedSupabaseOrigin || url.origin !== expectedSupabaseOrigin) {
      return false;
    }

    if (url.protocol !== 'https:' || url.pathname !== '/auth/v1/authorize') {
      return false;
    }

    if (url.searchParams.get('provider') !== 'google') {
      return false;
    }

    const redirectTo = url.searchParams.get('redirect_to');
    return Boolean(redirectTo && isDesktopBrowserCompletionUrl(redirectTo));
  } catch {
    return false;
  }
}
