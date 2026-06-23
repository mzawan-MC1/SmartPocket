import type { Metadata } from 'next';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { buildPageMetadata, resolveMetadataLanguage } from '@/lib/site-metadata';
import HomePageClient from './HomePageClient';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);

  return buildPageMetadata({
    settings,
    language,
    pathname: '/home',
    title: settings.seo.siteTitle,
    description: settings.seo.siteDescription,
    openGraphTitle: settings.seo.ogTitle,
    openGraphDescription: settings.seo.ogDescription,
    twitterTitle: settings.seo.twitterTitle,
    twitterDescription: settings.seo.twitterDescription,
  });
}

export default function HomePage() {
  return <HomePageClient />;
}
