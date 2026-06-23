import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CmsPageView from '@/components/cms/CmsPageView';
import StructuredDataScripts from '@/components/seo/StructuredDataScripts';
import { resolveInitialI18nState } from '@/i18n/server';
import { BASE_I18N_RESOURCES } from '@/i18n/resources';
import { getAnyCmsPageBySlug, getPublicCmsPageBySlug } from '@/lib/cms-pages-server';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { buildBreadcrumbStructuredData, buildPageMetadata, resolveMetadataLanguage } from '@/lib/site-metadata';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);
  const publicText = BASE_I18N_RESOURCES[language].public as Record<string, any>;
  const englishPublicText = BASE_I18N_RESOURCES.en.public as Record<string, any>;
  const legalText = publicText.legal?.terms || {};
  const englishLegalText = englishPublicText.legal?.terms || {};
  const page = await getPublicCmsPageBySlug('terms');
  if (!page) {
    return buildPageMetadata({
      settings,
      language,
      pathname: '/terms',
      title: legalText.metadataTitle || englishLegalText.metadataTitle,
      description: legalText.metadataDescription || englishLegalText.metadataDescription,
    });
  }

  return buildPageMetadata({
    settings,
    language,
    pathname: '/terms',
    title: page.seo_title_resolved,
    description: page.seo_description_resolved,
    socialImageUrl: page.seo_image_url || settings.branding.socialImageUrl,
  });
}

async function LegacyTermsPage() {
  const settings = await getPlatformSettingsSnapshot();
  const initialI18nState = await resolveInitialI18nState(settings);
  const publicText = BASE_I18N_RESOURCES[initialI18nState.language].public as Record<string, any>;
  const englishPublicText = BASE_I18N_RESOURCES.en.public as Record<string, any>;
  const legalText = publicText.legal?.terms || englishPublicText.legal?.terms || {};
  const sections = Array.isArray(legalText.sections) ? legalText.sections : [];
  const structuredData = [
    buildBreadcrumbStructuredData(settings, [
      { name: settings.branding.appName, path: '/home' },
      { name: legalText.title || 'Terms of Service', path: '/terms' },
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

export default async function TermsPage() {
  const cmsPage = await getPublicCmsPageBySlug('terms');
  if (cmsPage) {
    return <CmsPageView page={cmsPage} />;
  }

  const anyPage = await getAnyCmsPageBySlug('terms');
  if (anyPage) {
    notFound();
  }

  return <LegacyTermsPage />;
}
