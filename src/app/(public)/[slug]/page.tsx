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
    socialImageUrl: page.seo_image_url || settings.branding.socialImageUrl,
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
        imageUrl: page.seo_image_url || settings.branding.socialImageUrl,
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
