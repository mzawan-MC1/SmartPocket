import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CmsPageView from '@/components/cms/CmsPageView';
import StructuredDataScripts from '@/components/seo/StructuredDataScripts';
import { isReservedCmsSlug } from '@/lib/cms-pages';
import { getAnyCmsPageBySlug, getPublicCmsPageBySlug } from '@/lib/cms-pages-server';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import {
  buildArticleStructuredData,
  buildBreadcrumbStructuredData,
  buildPageMetadata,
  resolveMetadataLanguage,
} from '@/lib/site-metadata';

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  if (isReservedCmsSlug(slug)) {
    return {};
  }
  const page = await getPublicCmsPageBySlug(slug);

  if (!page) {
    return {};
  }

  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);

  return buildPageMetadata({
    settings,
    language,
    pathname: `/${slug}`,
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

export default async function PublicCmsSlugPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (isReservedCmsSlug(slug)) {
    notFound();
  }
  const page = await getPublicCmsPageBySlug(slug);

  if (page) {
    const settings = await getPlatformSettingsSnapshot();
    const language = await resolveMetadataLanguage(settings);
    const structuredData = [
      buildBreadcrumbStructuredData(settings, [
        { name: settings.branding.appName, path: '/home' },
        { name: page.title, path: `/${page.slug}` },
      ]),
      buildArticleStructuredData({
        settings,
        title: page.seo_title_resolved,
        description: page.seo_description_resolved,
        pathname: `/${page.slug}`,
        imageUrl: page.seo_image_url || undefined,
        publishedAt: page.published_at,
        updatedAt: page.updated_at,
        language,
      }),
    ];

    return (
      <>
        <StructuredDataScripts entries={structuredData} />
        <CmsPageView page={page} />
      </>
    );
  }

  const anyPage = await getAnyCmsPageBySlug(slug);
  if (anyPage) {
    notFound();
  }

  notFound();
}
