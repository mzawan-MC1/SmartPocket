import type { Metadata } from 'next';
import StructuredDataScripts from '@/components/seo/StructuredDataScripts';
import SecurityPageClient from '@/app/(public)/security/SecurityPageClient';
import { BASE_I18N_RESOURCES } from '@/i18n/resources';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import {
  buildAbsoluteSiteUrl,
  buildBreadcrumbStructuredData,
  buildFaqStructuredData,
  buildPageMetadata,
  resolveMetadataLanguage,
  type StructuredDataValue,
} from '@/lib/site-metadata';

type SecurityFaq = {
  question: string;
  answer: string;
};

function getSecurityText(publicText: Record<string, unknown>) {
  return (publicText.securityPage as Record<string, unknown> | undefined) || {};
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function readFaqArray(value: unknown): SecurityFaq[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      question: readString((item as Record<string, unknown>)?.question),
      answer: readString((item as Record<string, unknown>)?.answer),
    }))
    .filter((item) => item.question && item.answer);
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);
  const publicText = BASE_I18N_RESOURCES[language].public as Record<string, unknown>;
  const englishText = BASE_I18N_RESOURCES.en.public as Record<string, unknown>;
  const securityText = getSecurityText(publicText);
  const englishSecurityText = getSecurityText(englishText);

  return buildPageMetadata({
    settings,
    language,
    pathname: '/security',
    canonicalPath: '/security',
    title: readString(
      securityText.seoTitle,
      readString(
        englishSecurityText.seoTitle,
        'Smart Pocket Security & Trust | Personal Finance Privacy and Account Protection'
      )
    ),
    description: readString(
      securityText.seoDescription,
      readString(
        englishSecurityText.seoDescription,
        'Learn how Smart Pocket helps protect your private money data, secure your account, and keep AI-assisted actions review-based before anything is saved.'
      )
    ),
    openGraphTitle: readString(
      securityText.ogTitle,
      readString(
        englishSecurityText.ogTitle,
        readString(securityText.seoTitle, 'Smart Pocket Security & Trust')
      )
    ),
    openGraphDescription: readString(
      securityText.ogDescription,
      readString(englishSecurityText.ogDescription, readString(securityText.seoDescription))
    ),
    twitterTitle: readString(
      securityText.twitterTitle,
      readString(englishSecurityText.twitterTitle, readString(securityText.ogTitle))
    ),
    twitterDescription: readString(
      securityText.twitterDescription,
      readString(englishSecurityText.twitterDescription, readString(securityText.ogDescription))
    ),
  });
}

export default async function SecurityPage() {
  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);
  const publicText = BASE_I18N_RESOURCES[language].public as Record<string, unknown>;
  const englishText = BASE_I18N_RESOURCES.en.public as Record<string, unknown>;
  const securityText = getSecurityText(publicText);
  const englishSecurityText = getSecurityText(englishText);
  const faqs = readFaqArray(securityText.faqs).length > 0
    ? readFaqArray(securityText.faqs)
    : readFaqArray(englishSecurityText.faqs);
  const breadcrumbName = readString(
    securityText.breadcrumbLabel,
    readString(englishSecurityText.breadcrumbLabel, 'Security')
  );
  const structuredData: StructuredDataValue[] = [
    buildBreadcrumbStructuredData(settings, [
      { name: settings.branding.appName, path: '/' },
      { name: breadcrumbName, path: '/security' },
    ]),
    buildFaqStructuredData({
      pageUrl: buildAbsoluteSiteUrl('/security', settings),
      language,
      items: faqs.map((item) => ({
        question: item.question,
        answerText: item.answer,
      })),
    }),
  ].filter((entry): entry is StructuredDataValue => Boolean(entry));

  return (
    <>
      <StructuredDataScripts entries={structuredData} />
      <SecurityPageClient />
    </>
  );
}
