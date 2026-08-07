import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CmsPageView from '@/components/cms/CmsPageView';
import StructuredDataScripts from '@/components/seo/StructuredDataScripts';
import { getAnyCmsPageBySlug, getPublicCmsPageBySlug } from '@/lib/cms-pages-server';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import {
  buildArticleStructuredData,
  buildBreadcrumbStructuredData,
  buildPageMetadata,
  getEmergencyPageMetadataFallback,
  resolveMetadataLanguage,
} from '@/lib/site-metadata';

export const revalidate = 60;

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

  if (!cmsPage) {
    if (anyPage) {
      notFound();
    }
    notFound();
  }

  const structuredData = [
    buildBreadcrumbStructuredData(settings, [
      { name: settings.branding.appName, path: '/' },
      { name: cmsPage.title, path: '/privacy' },
    ]),
    buildArticleStructuredData({
      settings,
      title: cmsPage.seo_title_resolved,
      description: cmsPage.seo_description_resolved,
      pathname: '/privacy',
      imageUrl: cmsPage.seo_image_url || undefined,
      publishedAt: cmsPage.published_at,
      updatedAt: cmsPage.updated_at,
      language: metadataLanguage,
    }),
  ];

  return (
    <>
      <StructuredDataScripts entries={structuredData} />
      <CmsPageView page={cmsPage} />
    </>
  );
}
