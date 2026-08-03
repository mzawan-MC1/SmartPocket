import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ContactPageClient from '@/app/(public)/contact/ContactPageClient';
import StructuredDataScripts from '@/components/seo/StructuredDataScripts';
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

export default async function ContactPage() {
  const settings = await getPlatformSettingsSnapshot();
  const [cmsPage, anyPage, metadataLanguage] = await Promise.all([
    getPublicCmsPageBySlug('contact'),
    getAnyCmsPageBySlug('contact'),
    resolveMetadataLanguage(settings),
  ]);

  if (!cmsPage && anyPage) {
    notFound();
  }

  const publicText = BASE_I18N_RESOURCES[metadataLanguage].public as Record<string, any>;
  const contactText = publicText.contact || {};
  const contactDetails = settings.publicUi;
  const supportEmail = contactDetails.contactEmail;
  const structuredData = [
    buildBreadcrumbStructuredData(settings, [
      { name: settings.branding.appName, path: '/' },
      { name: contactText.titleFallback || 'Contact Us', path: '/contact' },
    ]),
  ];

  return (
    <>
      <StructuredDataScripts entries={structuredData} />
      <ContactPageClient
        email={supportEmail}
        phone={contactDetails.contactPhoneFormatted || contactDetails.contactPhone}
        address={contactDetails.contactAddress}
      />
    </>
  );
}
