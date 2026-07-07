import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CmsPageView from '@/components/cms/CmsPageView';
import SeoLandingPage from '@/components/public/SeoLandingPage';
import StructuredDataScripts from '@/components/seo/StructuredDataScripts';
import { BASE_I18N_RESOURCES } from '@/i18n/resources';
import { resolveInitialI18nState } from '@/i18n/server';
import { isReservedCmsSlug } from '@/lib/cms-pages';
import { getAnyCmsPageBySlug, getPublicCmsPageBySlug } from '@/lib/cms-pages-server';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import {
  getSeoLandingPageContent,
  getSeoLandingPageDefinition,
  isSeoLandingPageSlug,
  type SeoLandingPageSlug,
} from '@/lib/seo-landing-pages';
import {
  buildArticleStructuredData,
  buildBreadcrumbStructuredData,
  buildPageMetadata,
  buildAbsoluteSiteUrl,
  buildSoftwareApplicationStructuredData,
  resolveMetadataLanguage,
  type StructuredDataValue,
} from '@/lib/site-metadata';

function buildFaqStructuredData(args: {
  pageUrl: string;
  language: string;
  items: Array<{ question: string; answer: string }>;
}): StructuredDataValue | null {
  const validItems = args.items.filter((item) => item.question.trim() && item.answer.trim());
  if (validItems.length === 0) {
    return null;
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: args.language,
    url: args.pageUrl,
    mainEntity: validItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  if (isSeoLandingPageSlug(slug)) {
    const settings = await getPlatformSettingsSnapshot();
    const language = await resolveMetadataLanguage(settings);
    const publicText = BASE_I18N_RESOURCES[language].public as Record<string, unknown>;
    const content = getSeoLandingPageContent(publicText, slug);

    if (!content) {
      return {};
    }

    return buildPageMetadata({
      settings,
      language,
      pathname: `/${slug}`,
      canonicalPath: `/${slug}`,
      title: content.page.seoTitle,
      description: content.page.seoDescription,
      keywords: getSeoLandingPageDefinition(slug)?.keywords,
      openGraphTitle: content.page.ogTitle,
      openGraphDescription: content.page.ogDescription,
      twitterTitle: content.page.ogTitle,
      twitterDescription: content.page.ogDescription,
    });
  }

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
  if (isSeoLandingPageSlug(slug)) {
    return renderSeoLandingPage(slug);
  }

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

async function renderSeoLandingPage(slug: SeoLandingPageSlug) {
  const settings = await getPlatformSettingsSnapshot();
  const initialI18nState = await resolveInitialI18nState(settings);
  const publicText = BASE_I18N_RESOURCES[initialI18nState.language].public as Record<string, unknown>;
  const content = getSeoLandingPageContent(publicText, slug);
  const definition = getSeoLandingPageDefinition(slug);

  if (!content || !definition) {
    notFound();
  }

  const relatedPageTitles = definition.relatedSlugs.reduce((acc, relatedSlug) => {
    const relatedContent = getSeoLandingPageContent(publicText, relatedSlug);
    acc[relatedSlug] = relatedContent?.page.linkLabel || relatedSlug;
    return acc;
  }, {} as Record<SeoLandingPageSlug, string>);

  const structuredData = [
    buildBreadcrumbStructuredData(settings, [
      { name: settings.branding.appName, path: '/' },
      { name: content.page.hero.title, path: `/${slug}` },
    ]),
    await buildSoftwareApplicationStructuredData(settings),
    buildFaqStructuredData({
      pageUrl: buildAbsoluteSiteUrl(`/${slug}`, settings),
      language: initialI18nState.language,
      items: content.page.faqs,
    }),
  ].filter((entry): entry is StructuredDataValue => Boolean(entry));

  return (
    <>
      <StructuredDataScripts entries={structuredData} />
      <SeoLandingPage
        definition={definition}
        shared={content.shared}
        page={content.page}
        relatedPageTitles={relatedPageTitles}
      />
    </>
  );
}
