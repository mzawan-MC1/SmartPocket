import type { Metadata } from 'next';
import Link from 'next/link';
import CmsHtml from '@/components/cms/CmsHtml';
import { BASE_I18N_RESOURCES } from '@/i18n/resources';
import { resolveInitialI18nState } from '@/i18n/server';
import { getPublicCmsPageBySlug } from '@/lib/cms-pages-server';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { buildPageMetadata, resolveMetadataLanguage } from '@/lib/site-metadata';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);
  const page = await getPublicCmsPageBySlug('about');
  const publicText = BASE_I18N_RESOURCES[language].public as Record<string, any>;

  return buildPageMetadata({
    settings,
    language,
    pathname: '/about',
    title: page?.seo_title_resolved || `About ${settings.branding.appName}`,
    description:
      page?.seo_description_resolved ||
      publicText.home?.sections?.aboutDescription ||
      settings.seo.siteDescription,
  });
}

export default async function AboutPage() {
  const settings = await getPlatformSettingsSnapshot();
  const initialI18nState = await resolveInitialI18nState(settings);
  const publicText = BASE_I18N_RESOURCES[initialI18nState.language].public as Record<string, any>;
  const page = await getPublicCmsPageBySlug('about');

  return (
    <div className="py-16 px-4">
      <div className="max-w-5xl mx-auto space-y-12">
        <section className="max-w-3xl">
          <h1 className="text-4xl sm:text-5xl font-800 text-foreground mb-4">
            {page?.title || `About ${settings.branding.appName}`}
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {page?.seo_description_resolved ||
              publicText.home?.sections?.aboutDescription ||
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
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          <div className="card-elevated p-6">
            <h2 className="text-xl font-700 text-foreground mb-2">
              {publicText.home?.sections?.featuresTitle || 'Built for clarity'}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {publicText.home?.sections?.featuresDescription ||
                'Smart Pocket keeps accounts, budgets, and reports in one focused workspace.'}
            </p>
          </div>
          <div className="card-elevated p-6">
            <h2 className="text-xl font-700 text-foreground mb-2">
              {publicText.home?.sections?.securityTitle || 'Privacy first'}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {publicText.home?.sections?.securityDescription ||
                'The platform is designed around privacy-safe financial tracking and secure access controls.'}
            </p>
          </div>
          <div className="card-elevated p-6">
            <h2 className="text-xl font-700 text-foreground mb-2">
              {publicText.home?.sections?.languagesTitle || 'Multilingual access'}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {publicText.home?.sections?.languagesDescription ||
                'English, Arabic, French, and Russian are supported across the public experience.'}
            </p>
          </div>
        </section>

        <section className="card-elevated p-8">
          <h2 className="text-2xl font-700 text-foreground mb-3">
            {publicText.home?.sections?.ctaTitle || 'Ready to take control of your money?'}
          </h2>
          <p className="text-muted-foreground mb-6">
            {publicText.home?.sections?.ctaDescription || settings.seo.siteDescription}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/sign-up-login?mode=signup" className="btn-primary">
              {publicText.home?.cta?.primary || 'Create Account'}
            </Link>
            <Link href="/pricing" className="btn-secondary">
              {publicText.home?.linkPricing || 'View Pricing'}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
