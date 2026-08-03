import type { Metadata } from 'next';
import StructuredDataScripts from '@/components/seo/StructuredDataScripts';
import PublicFaqPageClient from '@/components/faqs/PublicFaqPageClient';
import { BASE_I18N_RESOURCES, type SupportedLanguage } from '@/i18n/resources';
import { getPublicFaqPageData } from '@/lib/faqs-server';
import { createServerComponentSupabaseClient } from '@/lib/supabase/server';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import {
  buildAbsoluteSiteUrl,
  buildBreadcrumbStructuredData,
  buildFaqStructuredData,
  buildPageMetadata,
  resolveMetadataLanguage,
  type StructuredDataValue,
} from '@/lib/site-metadata';

const PUBLIC_LANGUAGES: SupportedLanguage[] = ['en', 'ar', 'fr', 'ru'];
type FaqPageLanguageData = Awaited<ReturnType<typeof getPublicFaqPageData>>;

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
  const metadataLanguage = await resolveMetadataLanguage(settings);
  const [supabase, ...faqPageDataResults] = await Promise.all([
    createServerComponentSupabaseClient(),
    ...PUBLIC_LANGUAGES.map((language) => getPublicFaqPageData(language)),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const faqDataByLanguage = PUBLIC_LANGUAGES.reduce((accumulator, language, index) => {
    const pageData = faqPageDataResults[index];
    accumulator[language] = {
      categories: pageData.categories,
      items: pageData.items,
    };
    return accumulator;
  }, {} as Record<SupportedLanguage, { categories: FaqPageLanguageData['categories']; items: FaqPageLanguageData['items'] }>);
  const publicText = BASE_I18N_RESOURCES[metadataLanguage].public as Record<string, any>;
  const faqText = publicText.faqs || {};
  const structuredFaqData = faqDataByLanguage[metadataLanguage];

  const structuredData = [
    buildBreadcrumbStructuredData(settings, [
      { name: settings.branding.appName, path: '/' },
      { name: faqText.title || 'Frequently Asked Questions', path: '/faqs' },
    ]),
    buildFaqStructuredData({
      pageUrl: buildAbsoluteSiteUrl('/faqs', settings),
      language: metadataLanguage,
      items: structuredFaqData.items.map((item) => ({
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
            dataByLanguage={faqDataByLanguage}
            supportHref={user ? '/support/new' : '/contact'}
          />
        </div>
      </div>
    </>
  );
}
