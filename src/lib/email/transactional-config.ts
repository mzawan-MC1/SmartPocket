import 'server-only';

import {
  PRODUCTION_CANONICAL_ORIGIN,
  type PlatformSettingsSnapshot,
} from '@/lib/platform-settings';

const LOCAL_DEV_ORIGIN = 'http://localhost:4028';

function normalizeOrigin(value: string | null | undefined) {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    parsed.hash = '';
    parsed.pathname = '';
    parsed.search = '';
    parsed.username = '';
    parsed.password = '';

    if (parsed.hostname === 'www.1smartpocket.com') {
      parsed.hostname = '1smartpocket.com';
    }

    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase();
  return (
    normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)
    || normalized.includes(':')
  );
}

function isAllowedOrigin(origin: string | null, allowLocal: boolean) {
  if (!origin) return false;

  try {
    const hostname = new URL(origin).hostname;
    if (!allowLocal && isLocalHostname(hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function pickFirstOrigin(candidates: Array<string | null | undefined>, allowLocal: boolean) {
  for (const candidate of candidates) {
    const normalized = normalizeOrigin(candidate);
    if (isAllowedOrigin(normalized, allowLocal)) {
      return normalized;
    }
  }

  return null;
}

function getConfiguredSettingOrigins(settings: PlatformSettingsSnapshot) {
  const raw = settings.raw || {};

  return [
    typeof raw.canonical_url === 'string' ? raw.canonical_url : null,
    typeof raw.footer_website_url === 'string' ? raw.footer_website_url : null,
    typeof raw.email_footer_website_url === 'string' ? raw.email_footer_website_url : null,
    typeof raw.site_url === 'string' ? raw.site_url : null,
    typeof raw.app_url === 'string' ? raw.app_url : null,
  ];
}

export function resolveTransactionalBaseUrl(settings: PlatformSettingsSnapshot) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  const configuredOrigin = pickFirstOrigin(getConfiguredSettingOrigins(settings), false);
  if (configuredOrigin) {
    return configuredOrigin;
  }

  const envOrigin = pickFirstOrigin([
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.SITE_URL,
  ], false);
  if (envOrigin) {
    return envOrigin;
  }

  if (isDevelopment) {
    return LOCAL_DEV_ORIGIN;
  }

  return PRODUCTION_CANONICAL_ORIGIN;
}

export function buildTransactionalAppUrl(
  pathname: string,
  settings: PlatformSettingsSnapshot
) {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return new URL(normalizedPath, `${resolveTransactionalBaseUrl(settings)}/`).toString();
}
