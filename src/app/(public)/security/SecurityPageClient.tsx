'use client';

import { ArrowRight, BadgeCheck, FileCheck2, LockKeyhole, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import TrackedAnalyticsLink from '@/components/analytics/TrackedAnalyticsLink';
import { useLanguage } from '@/contexts/LanguageContext';

type SecurityCard = {
  title: string;
  description: string;
};

type SecurityFaq = {
  question: string;
  answer: string;
};

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

  return value.map((item) => readString(item)).filter(Boolean);
}

export default function SecurityPageClient() {
  const { t } = useTranslation('public');
  const { dir } = useLanguage();
  const trustCards = readCardArray(t('securityPage.trustCards', { returnObjects: true }));
  const protectionCards = readCardArray(
    t('securityPage.protectionCards', { returnObjects: true })
  );
  const checklistItems = readStringArray(
    t('securityPage.checklistItems', { returnObjects: true })
  );
  const faqs = readFaqArray(t('securityPage.faqs', { returnObjects: true }));
  const trustIcons = [ShieldCheck, LockKeyhole, UserRoundCheck, FileCheck2];
  const protectionIcons = [
    ShieldCheck,
    LockKeyhole,
    UserRoundCheck,
    FileCheck2,
    BadgeCheck,
    ShieldCheck,
  ];

  return (
    <div className="bg-background" dir={dir}>
      <section className="border-b border-border bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),transparent_38%),linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,1))]">
        <div className="page-shell py-14 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/15 bg-accent/10 px-4 py-2 text-xs font-700 uppercase tracking-[0.22em] text-accent">
              <ShieldCheck size={14} />
              {t('securityPage.eyebrow')}
            </div>
            <h1 className="mt-6 text-4xl font-800 tracking-tight text-foreground sm:text-5xl">
              {t('securityPage.title')}
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">
              {t('securityPage.description')}
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <TrackedAnalyticsLink
                href="/sign-up-login"
                eventName="sp_signup_click"
                eventParams={{ source: 'security_hero' }}
                className="btn-primary h-12 px-6 text-sm"
              >
                {t('securityPage.primaryCta')}
                <ArrowRight size={16} className="ms-2" />
              </TrackedAnalyticsLink>
              <TrackedAnalyticsLink
                href="/contact"
                eventName="sp_contact_click"
                eventParams={{ source: 'security_hero' }}
                className="btn-secondary h-12 px-6 text-sm"
              >
                {t('securityPage.secondaryCta')}
              </TrackedAnalyticsLink>
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
              {t('securityPage.protectionEyebrow')}
            </p>
            <h2 className="mt-3 text-3xl font-800 tracking-tight text-foreground">
              {t('securityPage.protectionTitle')}
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              {t('securityPage.protectionDescription')}
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
              {t('securityPage.checklistEyebrow')}
            </p>
            <h2 className="mt-3 text-2xl font-800 tracking-tight text-foreground">
              {t('securityPage.checklistTitle')}
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {t('securityPage.checklistDescription')}
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
              {t('securityPage.supportNote')}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card/40">
        <div className="page-shell py-12 sm:py-14">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-xs font-700 uppercase tracking-[0.2em] text-accent">
              {t('securityPage.faqEyebrow')}
            </p>
            <h2 className="mt-3 text-3xl font-800 tracking-tight text-foreground">
              {t('securityPage.faqTitle')}
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
              {t('securityPage.faqDescription')}
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
              {t('securityPage.ctaEyebrow')}
            </p>
            <h2 className="mt-3 text-3xl font-800 tracking-tight text-foreground sm:text-4xl">
              {t('securityPage.ctaTitle')}
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
              {t('securityPage.ctaDescription')}
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <TrackedAnalyticsLink
                href="/sign-up-login"
                eventName="sp_signup_click"
                eventParams={{ source: 'security_final_cta' }}
                className="btn-primary h-12 px-6 text-sm"
              >
                {t('securityPage.primaryCta')}
                <ArrowRight size={16} className="ms-2" />
              </TrackedAnalyticsLink>
              <TrackedAnalyticsLink
                href="/contact"
                eventName="sp_contact_click"
                eventParams={{ source: 'security_final_cta' }}
                className="btn-secondary h-12 px-6 text-sm"
              >
                {t('securityPage.secondaryCta')}
              </TrackedAnalyticsLink>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
