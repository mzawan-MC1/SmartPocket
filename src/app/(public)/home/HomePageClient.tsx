'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Apple,
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  FileText,
  Languages,
  Lock,
  Mail,
  Monitor,
  PieChart,
  RefreshCw,
  Shield,
  Smartphone,
  Sparkles,
  Star,
  Tablet,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AppLogo from '@/components/ui/AppLogo';
import PricingPlansSection from '@/components/public/PricingPlansSection';
import { getPlatformSettings } from '@/lib/finance';
import { formatCurrencyText } from '@/lib/currency-formatting';
import { useLanguage } from '@/contexts/LanguageContext';

interface HeroSettings {
  hero_title?: string;
  hero_subtitle?: string;
  hero_cta_primary?: string;
  hero_cta_secondary?: string;
  app_name?: string;
}

const FEATURES = [
  { id: 'accounts', icon: Wallet, size: 'large' },
  { id: 'dashboard', icon: BarChart3, size: 'small' },
  { id: 'budgets', icon: PieChart, size: 'small' },
  { id: 'exports', icon: FileText, size: 'medium' },
  { id: 'recurring', icon: RefreshCw, size: 'small' },
  { id: 'security', icon: Shield, size: 'medium' },
] as const;

const HOW_IT_WORKS = [
  { id: 'create', step: '01' },
  { id: 'accounts', step: '02' },
  { id: 'transactions', step: '03' },
  { id: 'budgets', step: '04' },
  { id: 'reports', step: '05' },
] as const;

const LANGUAGES = [
  { code: 'EN', nameKey: 'common:language.en', dirKey: 'home.languages.ltr' },
  { code: 'AR', nameKey: 'common:language.ar', dirKey: 'home.languages.rtl' },
  { code: 'FR', nameKey: 'common:language.fr', dirKey: 'home.languages.ltr' },
  { code: 'RU', nameKey: 'common:language.ru', dirKey: 'home.languages.ltr' },
] as const;

function DashboardPreview() {
  const { t } = useTranslation('public');
  const previewAmounts = {
    totalBalance: formatCurrencyText(12480, { currencyCode: 'USD' }),
    income: formatCurrencyText(4200, { currencyCode: 'USD' }),
    expenses: formatCurrencyText(-2760, { currencyCode: 'USD' }),
    netFlow: formatCurrencyText(1440, { currencyCode: 'USD' }),
  };

  return (
    <div className="relative mx-auto mt-10 w-full max-w-6xl lg:mt-0">
      <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-r from-cyan-500/20 via-sky-500/8 to-blue-500/20 blur-3xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#071a34]/95 shadow-[0_24px_90px_rgba(2,12,32,0.45)]">
        <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          <div className="ml-3 flex h-8 flex-1 items-center rounded-full border border-white/10 bg-[#081323] px-4 text-[10px] text-slate-400">
            {t('home.preview.dashboardUrl')}
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] text-slate-300 sm:flex">
            <Sparkles size={11} className="text-cyan-300" />
            {t('home.ai.badge', { defaultValue: 'AI-ready' })}
          </div>
        </div>

        <div className="grid gap-0 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden border-r border-white/10 bg-[#051224]/90 p-4 lg:block">
            <div className="mb-5 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
              <AppLogo width={120} height={28} imageClassName="h-7 w-auto" />
            </div>
            <div className="space-y-2">
              {[
                { label: t('home.preview.brandName', { defaultValue: 'Smart Pocket' }), active: true, icon: BarChart3 },
                { label: t('home.features.accountsTitle'), active: false, icon: Wallet },
                { label: t('home.preview.recentTransactions'), active: false, icon: RefreshCw },
                { label: t('home.sections.pricingTitle'), active: false, icon: PieChart },
                { label: t('home.reports.title'), active: false, icon: FileText },
                { label: t('home.ai.badge', { defaultValue: 'AI' }), active: false, icon: Sparkles },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm ${
                      item.active
                        ? 'bg-cyan-500/18 text-white shadow-[inset_0_0_0_1px_rgba(103,232,249,0.2)]'
                        : 'text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    <Icon size={15} className={item.active ? 'text-cyan-300' : 'text-slate-500'} />
                    <span className="truncate">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </aside>

          <div className="relative bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_28%),linear-gradient(180deg,#08192f_0%,#061222_100%)] p-4 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-700 uppercase tracking-[0.2em] text-cyan-300/80">
                  {t('home.preview.brandName', { defaultValue: 'Smart Pocket' })}
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  {t('home.hero.subtitle')}
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{t('home.preview.balance')}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">30 days</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: t('home.preview.totalBalance'), value: previewAmounts.totalBalance, tone: 'text-white' },
                { label: t('home.preview.income'), value: previewAmounts.income, tone: 'text-emerald-300' },
                { label: t('home.preview.expenses'), value: previewAmounts.expenses, tone: 'text-rose-300' },
                { label: t('home.preview.netFlow'), value: previewAmounts.netFlow, tone: 'text-cyan-300' },
              ].map((metric) => (
                <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{metric.label}</p>
                  <p className={`mt-2 text-lg font-800 ${metric.tone}`}>{metric.value}</p>
                  <div className="mt-3 flex h-8 items-end gap-1">
                    {[38, 50, 45, 62, 58, 70].map((height, index) => (
                      <span
                        key={`${metric.label}-${index}`}
                        className="flex-1 rounded-t-full bg-gradient-to-t from-cyan-500/35 to-cyan-300/70"
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.9fr)]">
              <div className="rounded-[1.6rem] border border-white/10 bg-[#07192d]/95 p-4 shadow-[0_18px_40px_rgba(2,12,32,0.35)]">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-xs font-700 uppercase tracking-[0.18em] text-slate-400">
                    {t('home.preview.incomeVsExpenses')}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-300" />{t('home.preview.income')}</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-400" />{t('home.preview.expenses')}</span>
                  </div>
                </div>
                <div className="grid h-52 grid-cols-8 items-end gap-3">
                  {[
                    [34, 22],
                    [46, 28],
                    [41, 24],
                    [60, 30],
                    [55, 34],
                    [70, 38],
                    [64, 35],
                    [78, 44],
                  ].map(([incomeHeight, expenseHeight], index) => (
                    <div key={index} className="flex h-full flex-col justify-end gap-1">
                      <div className="rounded-t-2xl bg-gradient-to-t from-cyan-600 to-cyan-300" style={{ height: `${incomeHeight}%` }} />
                      <div className="rounded-t-2xl bg-gradient-to-t from-fuchsia-700 to-violet-400" style={{ height: `${expenseHeight}%` }} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-[1.6rem] border border-white/10 bg-[#07192d]/95 p-4">
                  <p className="text-xs font-700 uppercase tracking-[0.18em] text-slate-400">
                    {t('home.preview.spendingByCategory')}
                  </p>
                  <div className="mt-5 flex items-center gap-4">
                    <svg viewBox="0 0 120 120" className="h-24 w-24">
                      <circle cx="60" cy="60" r="42" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="16" />
                      <circle cx="60" cy="60" r="42" fill="none" stroke="#22d3ee" strokeWidth="16" strokeDasharray="90 264" strokeLinecap="round" />
                      <circle cx="60" cy="60" r="42" fill="none" stroke="#8b5cf6" strokeWidth="16" strokeDasharray="70 264" strokeDashoffset="-94" strokeLinecap="round" />
                      <circle cx="60" cy="60" r="42" fill="none" stroke="#38bdf8" strokeWidth="16" strokeDasharray="46 264" strokeDashoffset="-170" strokeLinecap="round" />
                      <circle cx="60" cy="60" r="28" fill="#07192d" />
                    </svg>
                    <div className="space-y-2">
                      {[
                        { label: t('home.preview.food'), tone: 'bg-cyan-300' },
                        { label: t('home.preview.transport'), tone: 'bg-violet-400' },
                        { label: t('home.preview.bills'), tone: 'bg-sky-400' },
                      ].map((category) => (
                        <div key={category.label} className="flex items-center gap-2 text-xs text-slate-300">
                          <span className={`h-2.5 w-2.5 rounded-full ${category.tone}`} />
                          {category.label}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.6rem] border border-white/10 bg-[#07192d]/95 p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-700 uppercase tracking-[0.18em] text-slate-400">
                    <Bot size={13} className="text-cyan-300" />
                    {t('home.ai.badge', { defaultValue: 'AI assistant' })}
                  </div>
                  <div className="space-y-2">
                    {[
                      t('home.ai.features.1'),
                      t('home.ai.features.2'),
                      t('home.ai.features.3'),
                    ].map((item) => (
                      <div key={item} className="rounded-2xl border border-cyan-400/10 bg-white/5 p-3 text-sm text-slate-300">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: t('home.currency.title'), icon: Languages },
                { label: t('home.ai.badge', { defaultValue: 'AI-assisted flows' }), icon: Sparkles },
                { label: t('home.security.label'), icon: Shield },
                { label: t('home.reports.title'), icon: BarChart3 },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/12">
                      <Icon size={17} className="text-cyan-300" />
                    </div>
                    <span className="font-600">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-8 left-4 hidden w-64 rounded-[1.5rem] border border-cyan-300/20 bg-[#081d35]/95 p-4 text-white shadow-[0_20px_45px_rgba(2,12,32,0.4)] md:block xl:left-auto xl:right-5">
        <div className="mb-3 flex items-center gap-2 text-xs font-700 uppercase tracking-[0.18em] text-cyan-300">
          <TrendingUp size={13} />
          {t('home.preview.netFlow')}
        </div>
        <p className="text-2xl font-800">{previewAmounts.netFlow}</p>
        <div className="mt-4 flex h-10 items-end gap-1">
          {[32, 40, 34, 58, 48, 70, 55, 74].map((height, index) => (
            <span
              key={index}
              className="flex-1 rounded-t-full bg-gradient-to-t from-cyan-600 to-cyan-300"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { t } = useTranslation(['public', 'common']);
  const { language } = useLanguage();
  const [hero, setHero] = useState<HeroSettings>({});

  useEffect(() => {
    getPlatformSettings()
      .then((data) => {
        if (data) setHero(data as HeroSettings);
      })
      .catch(() => {});
  }, []);

  const canUseSingleLanguageHeroOverride = language === 'en';
  const heroTitle = canUseSingleLanguageHeroOverride && hero.hero_title ? hero.hero_title : t('home.hero.title');
  const heroSubtitle = canUseSingleLanguageHeroOverride && hero.hero_subtitle ? hero.hero_subtitle : t('home.hero.subtitle');
  const heroCTAPrimary = canUseSingleLanguageHeroOverride && hero.hero_cta_primary ? hero.hero_cta_primary : t('home.hero.primaryCta');
  const heroCTASecondary = canUseSingleLanguageHeroOverride && hero.hero_cta_secondary ? hero.hero_cta_secondary : t('home.hero.secondaryCta');
  const heroTitleLines = heroTitle.split('\n');
  const heroAccentIndex = Math.max(heroTitleLines.length - 1, 0);

  return (
    <div className="overflow-x-hidden bg-[#f4f7fb] text-slate-950">
      <section className="relative overflow-hidden bg-[#041229] px-4 pb-20 pt-14 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.14),transparent_22%)]" />
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-b from-transparent to-[#061426]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[minmax(0,0.88fr)_minmax(520px,1fr)] lg:gap-10">
          <div className="max-w-2xl pt-4 lg:pt-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-4 py-2 text-xs font-700 uppercase tracking-[0.22em] text-cyan-200">
              <Sparkles size={12} className="text-cyan-300" />
              {t('home.hero.aiBadge', { defaultValue: 'AI-powered personal finance' })}
            </div>
            <h1 className="mt-6 text-5xl font-800 leading-[1.02] tracking-tight text-white sm:text-6xl xl:text-7xl">
              {heroTitleLines.map((line, index) => (
                <span key={index} className="block">
                  {index === heroAccentIndex ? (
                    <span className="bg-gradient-to-r from-cyan-300 via-sky-300 to-emerald-300 bg-clip-text text-transparent">
                      {line}
                    </span>
                  ) : (
                    line
                  )}
                </span>
              ))}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300 sm:text-xl">
              {heroSubtitle}
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/sign-up-login"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-8 py-4 text-base font-700 text-slate-950 shadow-[0_18px_40px_rgba(34,211,238,0.25)] transition-transform hover:-translate-y-0.5"
              >
                {heroCTAPrimary}
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/home#features"
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-8 py-4 text-base font-700 text-white transition-colors hover:bg-white/10"
              >
                {heroCTASecondary}
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-300">
              <span className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-300" />{t('home.trust.noCard')}</span>
              <span className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-300" />{t('home.trust.freePlan')}</span>
              <span className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-300" />{t('home.trust.oauthEnabled')}</span>
            </div>
          </div>
          <DashboardPreview />
        </div>
      </section>

      <section id="about" className="scroll-mt-28 px-4 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end">
            <div>
              <p className="text-xs font-800 uppercase tracking-[0.24em] text-cyan-600">
                {t('home.sections.aboutEyebrow', { defaultValue: 'Everything in one place' })}
              </p>
              <h2 className="mt-4 text-3xl font-800 tracking-tight text-slate-950 sm:text-5xl">
                {t('home.sections.aboutTitle')}
              </h2>
            </div>
            <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              {t('home.sections.aboutDescription')}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_16px_40px_rgba(15,23,42,0.06)] xl:col-span-1">
              <h3 className="text-[2rem] font-800 leading-tight text-slate-950">
                {t('home.sections.aboutTitle')}
              </h3>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                {t('home.sections.featuresDescription')}
              </p>
            </div>

            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              const isLarge = feature.size === 'large';
              const isMedium = feature.size === 'medium';
              return (
                <div
                  key={feature.id}
                  className={`rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)] ${
                    isLarge ? 'md:col-span-2 xl:col-span-1' : ''
                  } ${isMedium ? 'md:col-span-2 xl:col-span-1' : ''}`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-100 to-sky-100">
                    <Icon size={22} className="text-cyan-700" />
                  </div>
                  <h3 className="mt-5 text-xl font-700 text-slate-950">
                    {t(`home.features.${feature.id}Title`)}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {t(`home.features.${feature.id}Description`)}
                  </p>
                  <div className="mt-6 rounded-2xl bg-slate-50 p-4">
                    <div className="flex h-20 items-end gap-2">
                      {[38, 45, 32, 58, 46, 68].map((height, index) => (
                        <span
                          key={`${feature.id}-${index}`}
                          className="flex-1 rounded-t-full bg-gradient-to-t from-cyan-500/25 to-sky-400/60"
                          style={{ height: `${height}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-28 px-4 pb-20">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.2rem] bg-[#041229] text-white shadow-[0_24px_80px_rgba(2,12,32,0.22)]">
          <div className="grid gap-10 px-6 py-10 sm:px-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:px-12">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-700 uppercase tracking-[0.18em] text-cyan-200">
                <Bot size={13} className="text-cyan-300" />
                {t('home.ai.badge')}
              </div>
              <h2 className="mt-5 text-3xl font-800 tracking-tight sm:text-5xl">
                {t('home.ai.title', { defaultValue: 'Your finances, understood by AI' })}
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
                {t('home.ai.description')}
              </p>
              <div className="mt-6 space-y-3">
                {[
                  t('home.benefits.balanceTitle'),
                  t('home.benefits.reportsTitle'),
                  t('home.security.rlsTitle'),
                  t('home.sections.platformTitle'),
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 text-sm text-slate-200">
                    <CheckCircle2 size={16} className="text-emerald-300" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/20 blur-3xl" />
              <div className="relative mx-auto flex h-44 w-44 items-center justify-center rounded-full border border-cyan-300/20 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.28),rgba(3,7,18,0.2)_50%,rgba(3,7,18,0)_70%)] shadow-[0_0_0_10px_rgba(34,211,238,0.05)]">
                <div className="flex h-24 w-24 items-center justify-center rounded-full border border-cyan-300/30 bg-[#05172c]">
                  <Bot size={42} className="text-cyan-300" />
                </div>
              </div>
              <div className="mt-8 space-y-3">
                {[
                  t('home.ai.features.1'),
                  t('home.ai.features.2'),
                  t('home.ai.features.3'),
                  t('home.ai.features.4'),
                ].map((item, index) => (
                  <div
                    key={item}
                    className={`rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200 shadow-[0_12px_24px_rgba(2,12,32,0.22)] ${
                      index % 2 === 1 ? 'lg:ml-12' : 'lg:mr-12'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400/12">
                        <Sparkles size={14} className="text-cyan-300" />
                      </span>
                      <span>{item}</span>
                      <span className="ml-auto rounded-full bg-cyan-400/10 px-2.5 py-1 text-[11px] font-700 uppercase tracking-[0.12em] text-cyan-200">
                        {t('home.ai.planned')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            <h3 className="text-2xl font-800 text-slate-950">{t('home.sections.featuresTitle')}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{t('home.sections.featuresDescription')}</p>
            <div className="mt-5 flex h-20 items-end gap-1">
              {[22, 30, 28, 42, 35, 48, 40].map((height, index) => (
                <span key={index} className="flex-1 rounded-t-full bg-gradient-to-t from-cyan-500/15 to-sky-300/60" style={{ height: `${height}%` }} />
              ))}
            </div>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            <h3 className="text-xl font-700 text-slate-950">{t('home.sections.stepsTitle')}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{t('home.sections.stepsDescription')}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              {HOW_IT_WORKS.slice(0, 4).map((step, index) => (
                <div key={step.id} className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-700 text-slate-700">
                  <span className="text-cyan-600">{String(index + 1).padStart(2, '0')}</span>
                  {t(`home.steps.${step.id}Title`)}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            <h3 className="text-xl font-700 text-slate-950">{t('home.sections.platformTitle')}</h3>
            <div className="mt-5 space-y-4">
              {[
                { icon: Smartphone, label: t('home.platform.mobileTitle') },
                { icon: Monitor, label: t('home.platform.desktopTitle') },
                { icon: Tablet, label: t('home.platform.tabletTitle') },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50">
                      <Icon size={18} className="text-cyan-700" />
                    </div>
                    <span className="text-sm font-600 text-slate-700">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            <h3 className="text-xl font-700 text-slate-950">{t('home.security.heading')}</h3>
            <div className="mt-5 space-y-3">
              {[
                { icon: Lock, id: 'rls' },
                { icon: Shield, id: 'rest' },
                { icon: CheckCircle2, id: 'privacy' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.id} className="flex gap-3">
                    <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50">
                      <Icon size={14} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-700 text-slate-900">{t(`home.security.${item.id}Title`)}</p>
                      <p className="text-xs leading-5 text-slate-600">{t(`home.security.${item.id}Description`)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-4 py-2 text-xs font-700 uppercase tracking-[0.18em] text-cyan-700">
                <Languages size={12} />
                {t('home.languages.label')}
              </div>
              <h2 className="mt-5 text-3xl font-800 tracking-tight text-slate-950 sm:text-5xl">
                {t('home.sections.languagesTitle')}
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
                {t('home.sections.languagesDescription')}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {LANGUAGES.map((languageOption) => (
                  <div key={languageOption.code} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-700 text-slate-900">{t(languageOption.nameKey)}</p>
                    <p className="mt-1 text-xs text-slate-500">{t(languageOption.dirKey)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-6 md:col-span-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-100">
                    <Zap size={20} className="text-cyan-700" />
                  </div>
                  <div>
                    <p className="text-lg font-700 text-slate-950">{t('home.platform.pwaTitle')}</p>
                    <p className="text-sm text-slate-600">{t('home.platform.pwaDescription')}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6">
                <p className="text-xs font-700 uppercase tracking-[0.18em] text-slate-500">{t('home.currency.title')}</p>
                <div className="mt-4 space-y-3">
                  {[
                    { code: 'USD', name: t('home.currency.usd'), sample: formatCurrencyText(1250, { currencyCode: 'USD' }) },
                    { code: 'EUR', name: t('home.currency.eur'), sample: formatCurrencyText(1250, { currencyCode: 'EUR' }) },
                    { code: 'AED', name: t('home.currency.aed'), sample: formatCurrencyText(1250, { currencyCode: 'AED' }) },
                  ].map((currency) => (
                    <div key={currency.code} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                      <span className="text-sm font-600 text-slate-900">{currency.name}</span>
                      <span className="text-xs font-700 text-cyan-700">{currency.sample}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6">
                <p className="text-xs font-700 uppercase tracking-[0.18em] text-slate-500">
                  {t('home.sections.platformTitle')}
                </p>
                <div className="mt-5 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <Apple size={22} className="text-slate-900" />
                    <span className="text-sm font-600 text-slate-700">{t('home.auth.apple')}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-50 text-cyan-700">
                      <Sparkles size={15} />
                    </div>
                    <span className="text-sm font-600 text-slate-700">{t('home.auth.google')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PricingPlansSection sectionId="pricing" showViewDetailsLink={true} variant="dark" />

      <section className="px-4 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 rounded-[1.75rem] bg-gradient-to-r from-cyan-500 via-sky-500 to-violet-600 px-6 py-6 text-center text-white shadow-[0_18px_45px_rgba(14,116,144,0.22)] md:flex-row md:text-left">
          <div>
            <p className="text-2xl font-800 tracking-tight sm:text-3xl">
              {t('home.sections.ctaTitle')}
            </p>
            <p className="mt-2 max-w-2xl text-sm text-cyan-50 sm:text-base">
              {t('home.sections.ctaDescription')}
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link href="/sign-up-login" className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 text-sm font-700 text-slate-950">
              {t('home.cta.primary')}
            </Link>
            <Link href="/home#about" className="inline-flex items-center justify-center rounded-2xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-700 text-white">
              {t('home.learnMore')}
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-700 uppercase tracking-[0.18em] text-slate-600">
            <Mail size={12} />
            {t('home.contact.badge', { defaultValue: 'Get in touch' })}
          </div>
          <h2 className="mt-5 text-3xl font-800 tracking-tight text-slate-950 sm:text-5xl">
            {t('home.contact.title', { defaultValue: 'Have questions? We are here.' })}
          </h2>
          <p className="mt-5 text-base leading-7 text-slate-600 sm:text-lg">
            {t('home.contact.description', {
              defaultValue: 'Whether you need help getting started, have a feature request, or want to discuss pricing, our team is ready to help.',
            })}
          </p>
          <Link
            href="/contact"
            className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-8 py-4 text-base font-700 text-white shadow-[0_16px_30px_rgba(15,23,42,0.16)]"
          >
            <Mail size={18} />
            {t('home.cta.secondary')}
          </Link>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.2rem] bg-[#041229] text-white shadow-[0_24px_80px_rgba(2,12,32,0.22)]">
          <div className="grid gap-10 px-6 py-10 sm:px-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <div className="flex items-center justify-center lg:justify-start">
                <AppLogo size={52} />
              </div>
              <h2 className="mt-6 text-center text-3xl font-800 tracking-tight sm:text-5xl lg:text-left">
                {t('home.sections.ctaTitle')}
              </h2>
              <p className="mt-4 max-w-2xl text-center text-base leading-7 text-slate-300 lg:text-left">
                {t('home.sections.ctaDescription')}
              </p>
            </div>
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Link
                  href="/sign-up-login"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-700 text-slate-950"
                >
                  {heroCTAPrimary}
                  <ArrowRight size={15} />
                </Link>
                <Link
                  href="/home#pricing"
                  className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-700 text-white"
                >
                  {t('footer.linkPricing', { defaultValue: 'Pricing' })}
                </Link>
              </div>
              <div className="flex items-center justify-center gap-1.5 lg:justify-start">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} size={14} className="fill-amber-400 text-amber-400" />
                ))}
                <span className="ml-2 text-sm text-slate-300">{t('home.lovedWorldwide')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
