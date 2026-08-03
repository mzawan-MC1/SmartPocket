import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicLegalPageClient from '@/components/public/PublicLegalPageClient';
import StructuredDataScripts from '@/components/seo/StructuredDataScripts';
import { BASE_I18N_RESOURCES } from '@/i18n/resources';
import { getAnyCmsPageBySlug, getPublicCmsPageBySlug } from '@/lib/cms-pages-server';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import {
  buildBreadcrumbStructuredData,
  buildPageMetadata,
  getEmergencyPageMetadataFallback,
  resolveMetadataLanguage,
} from '@/lib/site-metadata';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);
  const page = await getPublicCmsPageBySlug('privacy');
  if (!page) {
    const fallback = getEmergencyPageMetadataFallback('/privacy');
    return buildPageMetadata({
      settings,
      language,
      pathname: '/privacy',
      title: fallback.title,
      description: fallback.description,
      keywords: fallback.keywords,
    });
  }

  return buildPageMetadata({
    settings,
    language,
    pathname: '/privacy',
    title: page.seo_title_resolved,
    description: page.seo_description_resolved,
    keywords: page.seo_keywords_resolved,
    openGraphTitle: page.og_title_resolved,
    openGraphDescription: page.og_description_resolved,
    twitterTitle: page.twitter_title_resolved,
    twitterDescription: page.twitter_description_resolved,
    socialImageUrl: page.seo_image_url || undefined,
    twitterImageUrl: page.twitter_image_url || undefined,
    canonicalUrl: page.canonical_url_override || undefined,
    index: page.robots_index ?? undefined,
    follow: page.robots_follow ?? undefined,
  });
}

export default async function PrivacyPage() {
  const settings = await getPlatformSettingsSnapshot();
  const [cmsPage, anyPage, metadataLanguage] = await Promise.all([
    getPublicCmsPageBySlug('privacy'),
    getAnyCmsPageBySlug('privacy'),
    resolveMetadataLanguage(settings),
  ]);

  if (!cmsPage && anyPage) {
    notFound();
  }

  const publicText = BASE_I18N_RESOURCES[metadataLanguage].public as Record<string, any>;
  const legalText = publicText.legal?.privacy || {};
  const structuredData = [
    buildBreadcrumbStructuredData(settings, [
      { name: settings.branding.appName, path: '/' },
      { name: legalText.title || 'Privacy Policy', path: '/privacy' },
    ]),
  ];

  return (
    <>
      <StructuredDataScripts entries={structuredData} />
      <PublicLegalPageClient pageKey="privacy" />
    </>
  );
}
