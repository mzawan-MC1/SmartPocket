import type { MetadataRoute } from 'next';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { buildAbsoluteAssetUrl, getCanonicalOrigin } from '@/lib/site-metadata';

function getManifestIconType(url: string) {
  const lower = url.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  return undefined;
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getPlatformSettingsSnapshot();
  const icon192 = buildAbsoluteAssetUrl(settings.branding.pwaIcon192Url, settings);
  const icon512 = buildAbsoluteAssetUrl(settings.branding.pwaIcon512Url, settings);

  return {
    name: settings.branding.appName,
    short_name: settings.branding.shortBrandName,
    description: settings.seo.siteDescription,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: settings.branding.primaryColor,
    lang: settings.localization.defaultLanguage,
    dir: settings.localization.defaultLanguage === 'ar' ? 'rtl' : 'ltr',
    categories: ['finance', 'productivity'],
    id: getCanonicalOrigin(settings),
    icons: [
      {
        src: icon192,
        sizes: '192x192',
        type: getManifestIconType(icon192),
        purpose: 'any',
      },
      {
        src: icon512,
        sizes: '512x512',
        type: getManifestIconType(icon512),
        purpose: 'any',
      },
      {
        src: icon192,
        sizes: '192x192',
        type: getManifestIconType(icon192),
        purpose: 'maskable',
      },
      {
        src: icon512,
        sizes: '512x512',
        type: getManifestIconType(icon512),
        purpose: 'maskable',
      },
    ],
  };
}
