import type { Metadata } from 'next';
import StructuredDataScripts from '@/components/seo/StructuredDataScripts';
import PublicFaqPageClient from '@/components/faqs/PublicFaqPageClient';
import { BASE_I18N_RESOURCES } from '@/i18n/resources';
import { resolveInitialI18nState } from '@/i18n/server';
import { getPublicFaqPageData } from '@/lib/faqs-server';
import { createServerComponentSupabaseClient } from '@/lib/supabase/server';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import {
  buildBreadcrumbStructuredData,
  buildFaqStructuredData,
  buildPageMetadata,
  buildAbsoluteSiteUrl,
  resolveMetadataLanguage,
  type StructuredDataValue,
} from '@/lib/site-metadata';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);
  const publicText = BASE_I18N_RESOURCES[language].public as Record<string, any>;
  const faqText = publicText.faqs || {};
  const pageData = await getPublicFaqPageData(language);

  return buildPageMetadata({
    settings,
    language,
    pathname: '/faqs',
    title: pageData.seoPage?.seo_title_resolved || faqText.seoTitle || faqText.title,
    description:
      pageData.seoPage?.seo_description_resolved || faqText.seoDescription || faqText.introduction,
    keywords: pageData.seoPage?.seo_keywords_resolved || ['faqs', 'help', 'support', 'smart pocket'],
    openGraphTitle: pageData.seoPage?.og_title_resolved || faqText.ogTitle || faqText.seoTitle,
    openGraphDescription:
      pageData.seoPage?.og_description_resolved ||
      faqText.ogDescription ||
      faqText.seoDescription ||
      faqText.introduction,
    twitterTitle:
      pageData.seoPage?.twitter_title_resolved || faqText.ogTitle || faqText.seoTitle,
    twitterDescription:
      pageData.seoPage?.twitter_description_resolved ||
      faqText.ogDescription ||
      faqText.seoDescription ||
      faqText.introduction,
    canonicalUrl: pageData.seoPage?.canonical_url_override || undefined,
    index: pageData.seoPage?.robots_index ?? undefined,
    follow: pageData.seoPage?.robots_follow ?? undefined,
  });
}

export default async function FaqPage() {
  const settings = await getPlatformSettingsSnapshot();
  const initialI18nState = await resolveInitialI18nState(settings);
  const [faqData, supabase] = await Promise.all([
    getPublicFaqPageData(initialI18nState.language),
    createServerComponentSupabaseClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const publicText = BASE_I18N_RESOURCES[initialI18nState.language].public as Record<string, any>;
  const faqText = publicText.faqs || {};

  const structuredData = [
    buildBreadcrumbStructuredData(settings, [
      { name: settings.branding.appName, path: '/' },
      { name: faqText.title || 'Frequently Asked Questions', path: '/faqs' },
    ]),
    buildFaqStructuredData({
      pageUrl: buildAbsoluteSiteUrl('/faqs', settings),
      language: initialI18nState.language,
      items: faqData.items.map((item) => ({
        question: item.question,
        answerText: item.answerText,
      })),
    }),
  ].filter((entry): entry is StructuredDataValue => Boolean(entry));

  return (
    <>
      <StructuredDataScripts entries={structuredData} />
      <div className="bg-background px-4 py-10 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-6xl">
          <PublicFaqPageClient
            categories={faqData.categories}
            items={faqData.items}
            supportHref={user ? '/support/new' : '/contact'}
            initialLanguage={initialI18nState.language}
          />
        </div>
      </div>
    </>
  );
}
