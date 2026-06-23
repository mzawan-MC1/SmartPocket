import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CmsPageView from '@/components/cms/CmsPageView';
import StructuredDataScripts from '@/components/seo/StructuredDataScripts';
import { resolveInitialI18nState } from '@/i18n/server';
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

async function LegacyPrivacyPage() {
  const settings = await getPlatformSettingsSnapshot();
  const initialI18nState = await resolveInitialI18nState(settings);
  const publicText = BASE_I18N_RESOURCES[initialI18nState.language].public as Record<string, any>;
  const englishPublicText = BASE_I18N_RESOURCES.en.public as Record<string, any>;
  const legalText = publicText.legal?.privacy || englishPublicText.legal?.privacy || {};
  const sections = Array.isArray(legalText.sections) ? legalText.sections : [];
  const structuredData = [
    buildBreadcrumbStructuredData(settings, [
      { name: settings.branding.appName, path: '/home' },
      { name: legalText.title || 'Privacy Policy', path: '/privacy' },
    ]),
  ];

  return (
    <>
      <StructuredDataScripts entries={structuredData} />
      <div className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-700 text-foreground mb-2">{legalText.title}</h1>
          <p className="text-sm text-muted-foreground mb-8">
            {legalText.lastUpdatedLabel} {legalText.lastUpdatedDate}
          </p>
          <div className="space-y-8 text-muted-foreground">
            {sections.map((section: { title: string; content: string }) => (
              <div key={section?.title}>
                <h2 className="text-lg font-700 text-foreground mb-2">{section?.title}</h2>
                <p className="leading-relaxed">{section?.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default async function PrivacyPage() {
  const cmsPage = await getPublicCmsPageBySlug('privacy');
  if (cmsPage) {
    return <CmsPageView page={cmsPage} />;
  }

  const anyPage = await getAnyCmsPageBySlug('privacy');
  if (anyPage) {
    notFound();
  }

  return <LegacyPrivacyPage />;
}
