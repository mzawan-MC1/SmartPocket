import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  FileCheck2,
  LockKeyhole,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react';
import StructuredDataScripts from '@/components/seo/StructuredDataScripts';
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

type SecurityCard = {
  title: string;
  description: string;
};

type SecurityFaq = {
  question: string;
  answer: string;
};

function getSecurityText(publicText: Record<string, any>) {
  return publicText.securityPage || {};
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function readCardArray(value: unknown): SecurityCard[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      title: readString((item as Record<string, unknown>)?.title),
      description: readString((item as Record<string, unknown>)?.description),
    }))
    .filter((item) => item.title && item.description);
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

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readString(item))
    .filter(Boolean);
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);
  const publicText = BASE_I18N_RESOURCES[language].public as Record<string, any>;
  const englishText = BASE_I18N_RESOURCES.en.public as Record<string, any>;
  const securityText = getSecurityText(publicText);
  const englishSecurityText = getSecurityText(englishText);

  return buildPageMetadata({
    settings,
    language,
    pathname: '/security',
    canonicalPath: '/security',
    title:
      readString(
        securityText.seoTitle,
        readString(
          englishSecurityText.seoTitle,
          'Smart Pocket Security & Trust | Private, Protected Personal Finance'
        )
      ),
    description:
      readString(
        securityText.seoDescription,
        readString(
          englishSecurityText.seoDescription,
          'Learn how Smart Pocket helps protect your private money data, secure your account, and keep AI-assisted actions review-based before anything is saved.'
        )
      ),
    openGraphTitle: readString(
      securityText.ogTitle,
      readString(englishSecurityText.ogTitle, readString(securityText.seoTitle, 'Smart Pocket Security & Trust'))
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
  const publicText = BASE_I18N_RESOURCES[language].public as Record<string, any>;
  const englishText = BASE_I18N_RESOURCES.en.public as Record<string, any>;
  const securityText = getSecurityText(publicText);
  const englishSecurityText = getSecurityText(englishText);

  const trustCards = readCardArray(securityText.trustCards).length > 0
    ? readCardArray(securityText.trustCards)
    : readCardArray(englishSecurityText.trustCards);
  const protectionCards = readCardArray(securityText.protectionCards).length > 0
    ? readCardArray(securityText.protectionCards)
    : readCardArray(englishSecurityText.protectionCards);
  const checklistItems = readStringArray(securityText.checklistItems).length > 0
    ? readStringArray(securityText.checklistItems)
    : readStringArray(englishSecurityText.checklistItems);
  const faqs = readFaqArray(securityText.faqs).length > 0
    ? readFaqArray(securityText.faqs)
    : readFaqArray(englishSecurityText.faqs);

  const trustIcons = [ShieldCheck, LockKeyhole, UserRoundCheck, FileCheck2];
  const protectionIcons = [ShieldCheck, LockKeyhole, UserRoundCheck, FileCheck2, BadgeCheck, ShieldCheck];

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
      <div className="bg-background">
        <section className="border-b border-border bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),transparent_38%),linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,1))]">
          <div className="page-shell py-14 sm:py-16 lg:py-20">
            <div className="mx-auto max-w-4xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/15 bg-accent/10 px-4 py-2 text-xs font-700 uppercase tracking-[0.22em] text-accent">
                <ShieldCheck size={14} />
                {readString(securityText.eyebrow, readString(englishSecurityText.eyebrow, 'Security & Trust'))}
              </div>
              <h1 className="mt-6 text-4xl font-800 tracking-tight text-foreground sm:text-5xl">
                {readString(
                  securityText.title,
                  readString(
                    englishSecurityText.title,
                    'Your money data stays private and under your control'
                  )
                )}
              </h1>
              <p className="mx-auto mt-5 max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">
                {readString(
                  securityText.description,
                  readString(
                    englishSecurityText.description,
                    'Smart Pocket helps normal people manage money with confidence. We protect account access, keep personal data private, and use review-based AI flows so you stay in control before anything is saved.'
                  )
                )}
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/sign-up-login" className="btn-primary h-12 px-6 text-sm">
                  {readString(securityText.primaryCta, readString(englishSecurityText.primaryCta, 'Start Free Trial'))}
                  <ArrowRight size={16} className="ms-2" />
                </Link>
                <Link href="/contact" className="btn-secondary h-12 px-6 text-sm">
                  {readString(securityText.secondaryCta, readString(englishSecurityText.secondaryCta, 'Contact Support'))}
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="page-shell py-12 sm:py-14">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {trustCards.map((card, index) => {
              const Icon = trustIcons[index % trustIcons.length];
              return (
                <div key={`${card.title}-${index}`} className="card-elevated p-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                    <Icon size={20} />
                  </div>
                  <h2 className="text-lg font-700 text-foreground">{card.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{card.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="page-shell pb-12 sm:pb-14">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="card-elevated p-6 sm:p-8">
              <p className="text-xs font-700 uppercase tracking-[0.2em] text-accent">
                {readString(
                  securityText.protectionEyebrow,
                  readString(englishSecurityText.protectionEyebrow, 'How Smart Pocket protects you')
                )}
              </p>
              <h2 className="mt-3 text-3xl font-800 tracking-tight text-foreground">
                {readString(
                  securityText.protectionTitle,
                  readString(englishSecurityText.protectionTitle, 'Built to protect your account, data, and decisions')
                )}
              </h2>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {readString(
                  securityText.protectionDescription,
                  readString(
                    englishSecurityText.protectionDescription,
                    'Smart Pocket uses secure account controls behind the scenes, keeps each user account separate, and makes AI suggestions review-based so you stay in charge.'
                  )
                )}
              </p>

              <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
                {protectionCards.map((card, index) => {
                  const Icon = protectionIcons[index % protectionIcons.length];
                  return (
                    <div key={`${card.title}-${index}`} className="rounded-3xl border border-border bg-background p-5">
                      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                        <Icon size={18} />
                      </div>
                      <h3 className="text-base font-700 text-foreground">{card.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">{card.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card-elevated p-6 sm:p-8">
              <p className="text-xs font-700 uppercase tracking-[0.2em] text-accent">
                {readString(
                  securityText.checklistEyebrow,
                  readString(englishSecurityText.checklistEyebrow, 'Security checklist')
                )}
              </p>
              <h2 className="mt-3 text-2xl font-800 tracking-tight text-foreground">
                {readString(
                  securityText.checklistTitle,
                  readString(englishSecurityText.checklistTitle, 'Quick trust summary')
                )}
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {readString(
                  securityText.checklistDescription,
                  readString(
                    englishSecurityText.checklistDescription,
                    'A simple overview of the practical steps Smart Pocket takes to help protect you.'
                  )
                )}
              </p>
              <div className="mt-6 space-y-3">
                {checklistItems.map((item, index) => (
                  <div
                    key={`${item}-${index}`}
                    className="flex items-start gap-3 rounded-2xl border border-border bg-background px-4 py-3"
                  >
                    <BadgeCheck size={18} className="mt-0.5 shrink-0 text-accent" />
                    <p className="text-sm leading-6 text-foreground">{item}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-2xl border border-accent/15 bg-accent/5 px-4 py-4 text-sm leading-7 text-muted-foreground">
                {readString(
                  securityText.supportNote,
                  readString(
                    englishSecurityText.supportNote,
                    'If something looks wrong, contact Smart Pocket support as soon as possible so the team can help investigate.'
                  )
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-card/40">
          <div className="page-shell py-12 sm:py-14">
            <div className="mx-auto max-w-4xl text-center">
              <p className="text-xs font-700 uppercase tracking-[0.2em] text-accent">
                {readString(
                  securityText.faqEyebrow,
                  readString(englishSecurityText.faqEyebrow, 'Common questions')
                )}
              </p>
              <h2 className="mt-3 text-3xl font-800 tracking-tight text-foreground">
                {readString(
                  securityText.faqTitle,
                  readString(englishSecurityText.faqTitle, 'Security & trust FAQs')
                )}
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
                {readString(
                  securityText.faqDescription,
                  readString(
                    englishSecurityText.faqDescription,
                    'Clear answers to common questions about privacy, account protection, AI review, and support.'
                  )
                )}
              </p>
            </div>

            <div className="mx-auto mt-8 grid max-w-5xl gap-4">
              {faqs.map((faq, index) => (
                <div key={`${faq.question}-${index}`} className="card-elevated p-6">
                  <h3 className="text-lg font-700 text-foreground">{faq.question}</h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="page-shell py-12 sm:py-14 lg:py-16">
          <div className="rounded-[32px] border border-border bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),transparent_42%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,1))] p-6 shadow-card sm:p-8 lg:p-10">
            <div className="mx-auto max-w-4xl text-center">
              <p className="text-xs font-700 uppercase tracking-[0.2em] text-accent">
                {readString(
                  securityText.ctaEyebrow,
                  readString(englishSecurityText.ctaEyebrow, 'Start with confidence')
                )}
              </p>
              <h2 className="mt-3 text-3xl font-800 tracking-tight text-foreground sm:text-4xl">
                {readString(
                  securityText.ctaTitle,
                  readString(englishSecurityText.ctaTitle, 'Ready to manage money with more confidence?')
                )}
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
                {readString(
                  securityText.ctaDescription,
                  readString(
                    englishSecurityText.ctaDescription,
                    'Use Smart Pocket to track budgets, receipts, subscriptions, and everyday spending with review-based AI assistance and clear account control.'
                  )
                )}
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/sign-up-login" className="btn-primary h-12 px-6 text-sm">
                  {readString(securityText.primaryCta, readString(englishSecurityText.primaryCta, 'Start Free Trial'))}
                  <ArrowRight size={16} className="ms-2" />
                </Link>
                <Link href="/contact" className="btn-secondary h-12 px-6 text-sm">
                  {readString(securityText.secondaryCta, readString(englishSecurityText.secondaryCta, 'Contact Support'))}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
