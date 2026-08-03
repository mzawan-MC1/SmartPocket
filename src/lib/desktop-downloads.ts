import packageJson from '../../package.json';
import type { PlatformSettingsSnapshot } from '@/lib/platform-settings';

export type DesktopDownloadPlatform = 'windows' | 'macos';
export type DesktopPlatformAvailability = 'available' | 'coming_soon';
export type DesktopReleaseNoteTone = 'new' | 'improved' | 'fix';
export type DesktopReleaseNoteId =
  | 'desktop_auth'
  | 'windows_installer'
  | 'desktop_stability';

export type DesktopPlatformRelease = {
  platform: DesktopDownloadPlatform;
  enabled: boolean;
  availability: DesktopPlatformAvailability;
  installerType: string;
  systemRequirement: string;
  directDownloadUrl: string | null;
  statusLabel: string;
  showSmartScreenNote: boolean;
  version: string;
  releaseDate: string;
};

export type DesktopLatestUpdate = {
  title: string;
  date: string;
  notes: string[];
};

export type DesktopAppRelease = {
  heroImageUrl: string;
  heroImageAlt: string;
  releaseNotesPageUrl: string;
  latestUpdate: DesktopLatestUpdate;
  releaseNotes: Array<{
    id: DesktopReleaseNoteId;
    tone: DesktopReleaseNoteTone;
  }>;
  platforms: Record<DesktopDownloadPlatform, DesktopPlatformRelease>;
};

export const DESKTOP_APP_ROUTE = '/desktop-app';
export const DESKTOP_APP_PROMO_IMAGE_PATH = '/assets/images/smart-pocket-desktop-app.png';
export const DESKTOP_APP_PROMO_IMAGE_ALT =
  'Smart Pocket desktop app preview shown on a laptop with companion device and feature cards.';

const DESKTOP_RELEASE_NOTES_PAGE_URL = 'https://github.com/mzawan-MC1/SmartPocket/releases';
const DEFAULT_DESKTOP_RELEASE_DATE = '2026-08-03';
const DEFAULT_DESKTOP_UPDATE_TITLE = '';
const DEFAULT_DESKTOP_UPDATE_NOTES: string[] = [];
const MAX_DESKTOP_UPDATE_NOTES = 3;
const MAX_STATUS_LABEL_LENGTH = 60;

function readTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeIsoDate(value: unknown, fallback: string) {
  const trimmed = readTrimmedString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : fallback;
}

function sanitizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

export function sanitizeHttpsUrl(value: unknown) {
  const trimmed = readTrimmedString(value);
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

export function sanitizeDesktopMediaUrl(value: unknown) {
  const trimmed = readTrimmedString(value);
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('/')) {
    return trimmed.startsWith('//') ? '' : trimmed;
  }

  return sanitizeHttpsUrl(trimmed);
}

export function sanitizeDesktopStatusLabel(value: unknown) {
  return readTrimmedString(value).slice(0, MAX_STATUS_LABEL_LENGTH);
}

export function sanitizeDesktopUpdateNotes(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => readTrimmedString(entry))
      .filter(Boolean)
      .slice(0, MAX_DESKTOP_UPDATE_NOTES);
  }

  const trimmed = readTrimmedString(value);
  return trimmed ? [trimmed] : [];
}

export function isDesktopDownloadActive(platform: DesktopPlatformRelease) {
  return platform.enabled && !!platform.directDownloadUrl && platform.availability === 'available';
}

const DESKTOP_RELEASE_FALLBACK: DesktopAppRelease = {
  heroImageUrl: DESKTOP_APP_PROMO_IMAGE_PATH,
  heroImageAlt: DESKTOP_APP_PROMO_IMAGE_ALT,
  releaseNotesPageUrl: DESKTOP_RELEASE_NOTES_PAGE_URL,
  latestUpdate: {
    title: DEFAULT_DESKTOP_UPDATE_TITLE,
    date: DEFAULT_DESKTOP_RELEASE_DATE,
    notes: DEFAULT_DESKTOP_UPDATE_NOTES,
  },
  releaseNotes: [
    { id: 'desktop_auth', tone: 'new' },
    { id: 'windows_installer', tone: 'improved' },
    { id: 'desktop_stability', tone: 'fix' },
  ],
  platforms: {
    windows: {
      platform: 'windows',
      enabled: false,
      availability: 'coming_soon',
      installerType: 'EXE installer',
      systemRequirement: 'Windows 10 or later',
      directDownloadUrl: null,
      statusLabel: '',
      showSmartScreenNote: true,
      version: packageJson.version,
      releaseDate: DEFAULT_DESKTOP_RELEASE_DATE,
    },
    macos: {
      platform: 'macos',
      enabled: false,
      availability: 'coming_soon',
      installerType: 'Signed installer',
      systemRequirement: 'macOS 11 Big Sur or later',
      directDownloadUrl: null,
      statusLabel: '',
      showSmartScreenNote: false,
      version: packageJson.version,
      releaseDate: DEFAULT_DESKTOP_RELEASE_DATE,
    },
  },
};

function resolveDesktopPlatformRelease(
  raw: Record<string, unknown>,
  platform: DesktopDownloadPlatform,
  fallback: DesktopPlatformRelease
): DesktopPlatformRelease {
  const keyPrefix = platform === 'windows' ? 'desktop_windows' : 'desktop_macos';
  const enabled = sanitizeBoolean(raw[`${keyPrefix}_available`], fallback.enabled);
  const directDownloadUrl = sanitizeHttpsUrl(raw[`${keyPrefix}_download_url`]) || null;
  const version = readTrimmedString(raw[`${keyPrefix}_version`]) || fallback.version;
  const releaseDate = sanitizeIsoDate(raw[`${keyPrefix}_release_date`], fallback.releaseDate);
  const statusLabel = sanitizeDesktopStatusLabel(raw[`${keyPrefix}_status_label`]) || fallback.statusLabel;

  return {
    ...fallback,
    enabled,
    directDownloadUrl,
    version,
    releaseDate,
    statusLabel,
    availability: enabled && directDownloadUrl ? 'available' : 'coming_soon',
  };
}

export function resolveDesktopAppRelease(settings: PlatformSettingsSnapshot): DesktopAppRelease {
  const raw = settings.raw || {};

  return {
    heroImageUrl: sanitizeDesktopMediaUrl(raw.desktop_app_hero_image_url) || DESKTOP_RELEASE_FALLBACK.heroImageUrl,
    heroImageAlt: DESKTOP_RELEASE_FALLBACK.heroImageAlt,
    releaseNotesPageUrl: DESKTOP_RELEASE_FALLBACK.releaseNotesPageUrl,
    latestUpdate: {
      title: readTrimmedString(raw.desktop_update_title) || DESKTOP_RELEASE_FALLBACK.latestUpdate.title,
      date: sanitizeIsoDate(raw.desktop_update_date, DESKTOP_RELEASE_FALLBACK.latestUpdate.date),
      notes: sanitizeDesktopUpdateNotes(raw.desktop_update_notes),
    },
    releaseNotes: DESKTOP_RELEASE_FALLBACK.releaseNotes,
    platforms: {
      windows: resolveDesktopPlatformRelease(raw, 'windows', DESKTOP_RELEASE_FALLBACK.platforms.windows),
      macos: resolveDesktopPlatformRelease(raw, 'macos', DESKTOP_RELEASE_FALLBACK.platforms.macos),
    },
  };
}
