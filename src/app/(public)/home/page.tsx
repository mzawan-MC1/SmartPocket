import type { Metadata } from 'next';
import { BASE_I18N_RESOURCES } from '@/i18n/resources';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { buildPageMetadata, resolveMetadataLanguage } from '@/lib/site-metadata';
import HomePageClient from './HomePageClient';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);
  const publicText = BASE_I18N_RESOURCES[language].public as Record<string, any>;

  return buildPageMetadata({
    settings,
    language,
    pathname: '/home',
    title: publicText.home?.hero?.title || settings.seo.siteTitle,
    description: publicText.home?.hero?.subtitle || settings.seo.siteDescription,
  });
}

export default function HomePage() {
  return <HomePageClient />;
}
