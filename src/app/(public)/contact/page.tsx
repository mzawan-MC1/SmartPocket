import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Mail, MapPin, Phone } from 'lucide-react';
import CmsHtml from '@/components/cms/CmsHtml';
import ContactFormCard from '@/components/public/ContactFormCard';
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
  const page = await getPublicCmsPageBySlug('contact');
  if (!page) {
    const fallback = getEmergencyPageMetadataFallback('/contact');
    return buildPageMetadata({
      settings,
      language,
      pathname: '/contact',
      title: fallback.title,
      description: fallback.description,
      keywords: fallback.keywords,
    });
  }

  return buildPageMetadata({
    settings,
    language,
    pathname: '/contact',
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

function ContactDetails({
  email,
  phone,
  address,
  labels,
}: {
  email: string;
  phone: string;
  address: string;
  labels: {
    email: string;
    phone: string;
    address: string;
    missingEmail: string;
    missingPhone: string;
    missingAddress: string;
  };
}) {
  const items = [
    {
      key: 'email',
      icon: <Mail size={18} className="text-accent" />,
      label: labels.email,
      value: email || labels.missingEmail,
    },
    {
      key: 'phone',
      icon: <Phone size={18} className="text-accent" />,
      label: labels.phone,
      value: phone || labels.missingPhone,
    },
    {
      key: 'address',
      icon: <MapPin size={18} className="text-accent" />,
      label: labels.address,
      value: address || labels.missingAddress,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.key} className="card-elevated p-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            {item.icon}
          </div>
          <p className="text-sm font-700 text-foreground mb-1">{item.label}</p>
          <p className="text-sm text-muted-foreground whitespace-pre-line break-words">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function LegacyContactBody() {
  const englishPublicText = BASE_I18N_RESOURCES.en.public as Record<string, any>;
  const intro = englishPublicText.contact?.introFallback || '';
  return (
    <CmsHtml
      html={`<p>${intro}</p>`}
      className="prose prose-slate max-w-none text-muted-foreground [&_a]:text-accent [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground"
    />
  );
}

export default async function ContactPage() {
  const [cmsPage, anyPage, settings] = await Promise.all([
    getPublicCmsPageBySlug('contact'),
    getAnyCmsPageBySlug('contact'),
    getPlatformSettingsSnapshot(),
  ]);
  const initialI18nState = await resolveInitialI18nState(settings);
  const publicText = BASE_I18N_RESOURCES[initialI18nState.language].public as Record<string, any>;
  const englishPublicText = BASE_I18N_RESOURCES.en.public as Record<string, any>;

  if (!cmsPage && anyPage) {
    notFound();
  }

  const contactDetails = settings.publicUi;
  const supportEmail = settings.email.supportEmail || contactDetails.contactEmail || 'info@1smartpocket.com';
  const contactText = publicText.contact || {};
  const englishContactText = englishPublicText.contact || {};
  const structuredData = [
    buildBreadcrumbStructuredData(settings, [
      { name: settings.branding.appName, path: '/home' },
      { name: contactText.titleFallback || englishContactText.titleFallback, path: '/contact' },
    ]),
  ];

  return (
    <>
      <StructuredDataScripts entries={structuredData} />
      <div className="py-16 px-4">
        <div className="max-w-5xl mx-auto space-y-10">
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-4xl font-700 text-foreground mb-4">
            {contactText.titleFallback || englishContactText.titleFallback}
          </h1>
          {cmsPage ? (
            <CmsHtml
              html={cmsPage.content_html_sanitized}
              className="prose prose-slate mx-auto max-w-none text-muted-foreground [&_a]:text-accent [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground"
            />
          ) : (
            <CmsHtml
              html={`<p>${contactText.introFallback || englishContactText.introFallback}</p>`}
              className="prose prose-slate mx-auto max-w-none text-muted-foreground [&_a]:text-accent [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground"
            />
          )}
        </div>

        <ContactDetails
          email={supportEmail}
          phone={contactDetails.contactPhoneFormatted || contactDetails.contactPhone}
          address={contactDetails.contactAddress}
          labels={{
            email: contactText.detailsEmail || englishContactText.detailsEmail,
            phone: contactText.detailsPhone || englishContactText.detailsPhone,
            address: contactText.detailsAddress || englishContactText.detailsAddress,
            missingEmail: contactText.missingEmail || englishContactText.missingEmail,
            missingPhone: contactText.missingPhone || englishContactText.missingPhone,
            missingAddress: contactText.missingAddress || englishContactText.missingAddress,
          }}
        />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="card-elevated p-8">
            <h2 className="text-xl font-700 text-foreground mb-3">{contactText.formTitle || englishContactText.formTitle}</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {contactText.formDescription || englishContactText.formDescription}
            </p>
            <ContactFormCard />
          </div>

          <div className="card-elevated p-8">
            <h2 className="text-xl font-700 text-foreground mb-3">{contactText.detailsPanelTitle || englishContactText.detailsPanelTitle}</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {contactText.detailsPanelDescription || englishContactText.detailsPanelDescription}
            </p>
            <div className="space-y-5">
              <div>
                <p className="text-xs font-700 uppercase tracking-widest text-muted-foreground mb-1">{contactText.detailsEmail || englishContactText.detailsEmail}</p>
                <p className="text-sm text-foreground break-words">{supportEmail || contactText.notConfigured || englishContactText.notConfigured}</p>
              </div>
              <div>
                <p className="text-xs font-700 uppercase tracking-widest text-muted-foreground mb-1">{contactText.detailsPhone || englishContactText.detailsPhone}</p>
                <p className="text-sm text-foreground">
                  {contactDetails.contactPhoneFormatted || contactDetails.contactPhone || contactText.notConfigured || englishContactText.notConfigured}
                </p>
              </div>
              <div>
                <p className="text-xs font-700 uppercase tracking-widest text-muted-foreground mb-1">{contactText.detailsAddress || englishContactText.detailsAddress}</p>
                <p className="text-sm text-foreground whitespace-pre-line">{contactDetails.contactAddress || contactText.notConfigured || englishContactText.notConfigured}</p>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
