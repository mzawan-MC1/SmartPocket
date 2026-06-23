import type { Metadata } from 'next';
import CmsHtml from '@/components/cms/CmsHtml';
import PricingPlansSection from '@/components/public/PricingPlansSection';
import { BASE_I18N_RESOURCES } from '@/i18n/resources';
import { resolveInitialI18nState } from '@/i18n/server';
import { getPublicCmsPageBySlug } from '@/lib/cms-pages-server';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { buildPageMetadata, resolveMetadataLanguage } from '@/lib/site-metadata';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);
  const page = await getPublicCmsPageBySlug('pricing');
  const publicText = BASE_I18N_RESOURCES[language].public as Record<string, any>;

  return buildPageMetadata({
    settings,
    language,
    pathname: '/pricing',
    title: page?.seo_title_resolved || `Pricing | ${settings.branding.appName}`,
    description:
      page?.seo_description_resolved ||
      publicText.home?.sections?.pricingDescription ||
      settings.seo.siteDescription,
  });
}

export default async function PricingPage() {
  const settings = await getPlatformSettingsSnapshot();
  const initialI18nState = await resolveInitialI18nState(settings);
  const publicText = BASE_I18N_RESOURCES[initialI18nState.language].public as Record<string, any>;
  const page = await getPublicCmsPageBySlug('pricing');

  return (
    <div>
      <div className="px-4 pt-16">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl font-800 text-foreground mb-4">
              {page?.title || publicText.home?.sections?.pricingTitle || 'Pricing'}
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              {page?.seo_description_resolved ||
                publicText.home?.sections?.pricingDescription ||
                settings.seo.siteDescription}
            </p>
            {page?.content_html_sanitized ? (
              <div className="mt-6">
                <CmsHtml
                  html={page.content_html_sanitized}
                  className="prose prose-slate max-w-none text-muted-foreground [&_a]:text-accent [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <PricingPlansSection />
    </div>
  );
}
