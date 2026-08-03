import type { Metadata } from 'next';
import DesktopAppPageClient from '@/app/(public)/desktop-app/DesktopAppPageClient';
import { BASE_I18N_RESOURCES } from '@/i18n/resources';
import {
  DESKTOP_APP_ROUTE,
  resolveDesktopAppRelease,
} from '@/lib/desktop-downloads';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { buildPageMetadata, resolveMetadataLanguage } from '@/lib/site-metadata';

type UnknownRecord = Record<string, unknown>;

type DesktopPageText = {
  seoTitle?: string;
  seoDescription?: string;
  ogTitle?: string;
  ogDescription?: string;
};

const ENGLISH_PUBLIC_TEXT = BASE_I18N_RESOURCES.en.public as UnknownRecord;
const ENGLISH_DESKTOP_PAGE_TEXT = isRecord(ENGLISH_PUBLIC_TEXT.desktopAppPage)
  ? (ENGLISH_PUBLIC_TEXT.desktopAppPage as DesktopPageText)
  : {};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeDesktopPageText(base: unknown, override: unknown): unknown {
  if (Array.isArray(base)) {
    return Array.isArray(override) ? override : base;
  }

  if (isRecord(base)) {
    if (!isRecord(override)) {
      return base;
    }

    const merged: UnknownRecord = { ...base };
    const keys = new Set([...Object.keys(base), ...Object.keys(override)]);

    keys.forEach((key) => {
      merged[key] = mergeDesktopPageText(base[key], override[key]);
    });

    return merged;
  }

  return override ?? base;
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function getDesktopAppText(language: keyof typeof BASE_I18N_RESOURCES) {
  const publicText = BASE_I18N_RESOURCES[language].public as Record<string, unknown>;
  const localized = publicText.desktopAppPage;

  if (isRecord(localized)) {
    return mergeDesktopPageText(
      ENGLISH_DESKTOP_PAGE_TEXT as UnknownRecord,
      localized
    ) as DesktopPageText;
  }

  return ENGLISH_DESKTOP_PAGE_TEXT;
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);
  const desktopText = getDesktopAppText(language);
  const desktopRelease = resolveDesktopAppRelease(settings);

  return buildPageMetadata({
    settings,
    language,
    pathname: DESKTOP_APP_ROUTE,
    canonicalPath: DESKTOP_APP_ROUTE,
    title: readString(desktopText.seoTitle, 'Smart Pocket Desktop App'),
    description: readString(
      desktopText.seoDescription,
      'Download Smart Pocket for Windows and manage expenses, budgets, subscriptions, receipts and everyday finances from your desktop. The macOS version is coming soon.'
    ),
    openGraphTitle: readString(desktopText.ogTitle, readString(desktopText.seoTitle)),
    openGraphDescription: readString(desktopText.ogDescription, readString(desktopText.seoDescription)),
    socialImageUrl: desktopRelease.heroImageUrl,
    twitterImageUrl: desktopRelease.heroImageUrl,
  });
}

export default async function DesktopAppPage() {
  const settings = await getPlatformSettingsSnapshot();
  const desktopRelease = resolveDesktopAppRelease(settings);

  return (
    <DesktopAppPageClient
      desktopRelease={desktopRelease}
      appName={settings.branding.appName}
    />
  );
}
