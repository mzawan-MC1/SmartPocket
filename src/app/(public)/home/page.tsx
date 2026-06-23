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
    title: settings.seo.home.title,
    description: settings.seo.home.description,
    keywords:
      settings.seo.home.keywords.length > 0 ? settings.seo.home.keywords : settings.seo.keywords,
    openGraphTitle: settings.seo.home.ogTitle,
    openGraphDescription: settings.seo.home.ogDescription,
    twitterTitle: settings.seo.home.twitterTitle,
    twitterDescription: settings.seo.home.twitterDescription,
    socialImageUrl: settings.seo.home.socialImage,
    twitterImageUrl: settings.seo.home.twitterImage,
    index: settings.seo.home.robotsIndex,
    follow: settings.seo.home.robotsFollow,
  });
}

export default function HomePage() {
  return <HomePageClient />;
}
