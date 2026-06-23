import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart3, Lock, PieChart, RefreshCw, Wallet } from 'lucide-react';
import CmsHtml from '@/components/cms/CmsHtml';
import { BASE_I18N_RESOURCES } from '@/i18n/resources';
import { resolveInitialI18nState } from '@/i18n/server';
import { getPublicCmsPageBySlug } from '@/lib/cms-pages-server';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { buildPageMetadata, resolveMetadataLanguage } from '@/lib/site-metadata';

const FEATURE_ICONS = [Wallet, BarChart3, PieChart, RefreshCw, Lock] as const;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);
  const page = await getPublicCmsPageBySlug('features');
  const publicText = BASE_I18N_RESOURCES[language].public as Record<string, any>;

  return buildPageMetadata({
    settings,
    language,
    pathname: '/features',
    title: page?.seo_title_resolved || `Features | ${settings.branding.appName}`,
    description:
      page?.seo_description_resolved ||
      publicText.home?.sections?.featuresDescription ||
      settings.seo.siteDescription,
  });
}

export default async function FeaturesPage() {
  const settings = await getPlatformSettingsSnapshot();
  const initialI18nState = await resolveInitialI18nState(settings);
  const publicText = BASE_I18N_RESOURCES[initialI18nState.language].public as Record<string, any>;
  const page = await getPublicCmsPageBySlug('features');

  const featureRows = [
    {
      title: publicText.home?.features?.accountsTitle,
      description: publicText.home?.features?.accountsDescription,
    },
    {
      title: publicText.home?.features?.dashboardTitle,
      description: publicText.home?.features?.dashboardDescription,
    },
    {
      title: publicText.home?.features?.budgetsTitle,
      description: publicText.home?.features?.budgetsDescription,
    },
    {
      title: publicText.home?.features?.recurringTitle,
      description: publicText.home?.features?.recurringDescription,
    },
    {
      title: publicText.home?.features?.securityTitle,
      description: publicText.home?.features?.securityDescription,
    },
  ];

  return (
    <div className="py-16 px-4">
      <div className="max-w-5xl mx-auto space-y-12">
        <section className="max-w-3xl">
          <h1 className="text-4xl sm:text-5xl font-800 text-foreground mb-4">
            {page?.title || publicText.home?.sections?.featuresTitle || 'Features'}
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {page?.seo_description_resolved ||
              publicText.home?.sections?.featuresDescription ||
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

        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {featureRows.map((feature, index) => {
            const Icon = FEATURE_ICONS[index] || Wallet;
            return (
              <article key={feature.title || index} className="card-elevated p-6">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10">
                  <Icon size={20} className="text-accent" />
                </div>
                <h2 className="text-xl font-700 text-foreground mb-2">{feature.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </article>
            );
          })}
        </section>

        <section className="card-elevated p-8">
          <h2 className="text-2xl font-700 text-foreground mb-3">
            {publicText.home?.sections?.pricingTitle || 'Simple, transparent pricing'}
          </h2>
          <p className="text-muted-foreground mb-6">
            {publicText.home?.sections?.pricingDescription ||
              'Start free and upgrade only when you need more capacity or collaboration.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/pricing" className="btn-primary">
              {publicText.home?.pricing?.viewDetails || 'Compare plans'}
            </Link>
            <Link href="/contact" className="btn-secondary">
              {publicText.home?.cta?.secondary || 'Contact Us'}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
