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

type IconComponent = React.ComponentType<{
  size?: number | string;
  className?: string;
}>;

function FeatureCard({
  icon: Icon,
  title,
  description,
  visual,
  visualClassName = '',
  className = '',
}: {
  icon: IconComponent;
  title: string;
  description: string;
  visual: React.ReactNode;
  visualClassName?: string;
  className?: string;
}) {
  return (
    <article
      className={`group h-full rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_48px_rgba(15,23,42,0.1)] motion-reduce:transform-none motion-reduce:transition-none ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-100 via-sky-50 to-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          <Icon size={20} className="text-cyan-700" />
        </div>
        <div className={`w-full max-w-[180px] ${visualClassName}`}>{visual}</div>
      </div>
      <h3 className="mt-5 text-lg font-800 tracking-tight text-slate-950 sm:text-xl">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </article>
  );
}

function MultiAccountVisual() {
  const { t } = useTranslation('public');

  return (
    <div className="rounded-[1.35rem] border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-end gap-2">
        <div className="h-20 w-16 rounded-[1.1rem] border border-cyan-200 bg-gradient-to-b from-cyan-50 to-white p-2.5 shadow-[0_12px_24px_rgba(34,211,238,0.12)]">
          <div className="h-2.5 w-8 rounded-full bg-cyan-200" />
          <div className="mt-3 h-6 w-full rounded-xl bg-cyan-500/15" />
          <div className="mt-2.5 h-2 w-10 rounded-full bg-slate-200" />
        </div>
        <div className="mb-1 h-16 w-14 rounded-[1rem] border border-violet-200 bg-gradient-to-b from-violet-50 to-white p-2 shadow-[0_10px_20px_rgba(139,92,246,0.08)]">
          <div className="h-2.5 w-7 rounded-full bg-violet-200" />
          <div className="mt-3 h-4 w-full rounded-lg bg-violet-500/10" />
        </div>
        <div className="flex-1 rounded-[1rem] border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between text-[10px] font-700 uppercase tracking-[0.16em] text-slate-400">
            <span>{t('home.homeVisuals.multiAccount.wallet')}</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">{t('home.homeVisuals.common.live')}</span>
          </div>
          <div className="mt-2.5 space-y-2">
            <div className="h-2 rounded-full bg-slate-200" />
            <div className="h-2 w-4/5 rounded-full bg-cyan-300" />
            <div className="h-2 w-3/5 rounded-full bg-violet-200" />
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        {[
          { name: t('home.homeVisuals.multiAccount.cash'), badge: t('home.homeVisuals.multiAccount.primary'), width: 'w-[72%]' },
          { name: t('home.homeVisuals.multiAccount.bank'), badge: t('home.homeVisuals.multiAccount.synced'), width: 'w-[58%]' },
          { name: t('home.homeVisuals.multiAccount.wallet'), badge: t('home.homeVisuals.multiAccount.manual'), width: 'w-[44%]' },
        ].map((account) => (
          <div key={account.name} className="rounded-[1rem] border border-slate-200 bg-white px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
                <span className="text-sm font-700 text-slate-900">{account.name}</span>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-700 uppercase tracking-[0.16em] text-slate-500">
                {account.badge}
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-200">
              <div className={`h-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-sky-400 ${account.width}`} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-[1rem] bg-slate-900 px-3.5 py-3 text-white">
        <span className="text-xs font-700 uppercase tracking-[0.16em] text-slate-300">{t('home.homeVisuals.multiAccount.totalBalance')}</span>
        <span className="text-sm font-800">{t('home.homeVisuals.common.preview')}</span>
      </div>
    </div>
  );
}

function DashboardMiniVisual() {
  const { t } = useTranslation('public');

  return (
    <div className="rounded-[1.35rem] border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-end gap-2">
        {[32, 48, 44, 62, 56, 74].map((height, index) => (
          <span
            key={index}
            className="h-16 flex-1 rounded-full bg-gradient-to-t from-cyan-500/20 to-cyan-200/80"
            style={{ clipPath: `inset(${100 - height}% 0 0 0 round 999px)` }}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] font-700 uppercase tracking-[0.16em] text-slate-500">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-400" />{t('home.homeVisuals.dashboard.cashflow')}</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-300" />{t('home.homeVisuals.dashboard.trends')}</span>
      </div>
    </div>
  );
}

function BudgetVisual() {
  const { t } = useTranslation('public');

  return (
    <div className="rounded-[1.35rem] border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16">
          <svg viewBox="0 0 80 80" className="h-16 w-16 -rotate-90">
            <circle cx="40" cy="40" r="28" fill="none" stroke="rgb(226 232 240)" strokeWidth="10" />
            <circle
              cx="40"
              cy="40"
              r="28"
              fill="none"
              stroke="#06b6d4"
              strokeWidth="10"
              strokeDasharray="176"
              strokeDashoffset="48"
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-800 text-slate-900">
            72%
          </span>
        </div>
        <div className="flex-1 space-y-2">
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px] font-700 uppercase tracking-[0.16em] text-slate-500">
              <span>{t('home.homeVisuals.budget.needs')}</span>
              <span>54%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200">
              <div className="h-2 w-[54%] rounded-full bg-cyan-400" />
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px] font-700 uppercase tracking-[0.16em] text-slate-500">
              <span>{t('home.homeVisuals.budget.savings')}</span>
              <span>18%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200">
              <div className="h-2 w-[18%] rounded-full bg-emerald-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportsVisual() {
  const { t } = useTranslation('public');

  return (
    <div className="flex gap-3">
      <div className="flex-1 rounded-[1.2rem] border border-slate-200 bg-slate-50 p-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-xs font-800 text-rose-700">
          {t('home.homeVisuals.reports.pdf')}
        </div>
        <div className="mt-3 space-y-2">
          <div className="h-2 rounded-full bg-slate-200" />
          <div className="h-2 w-4/5 rounded-full bg-slate-200" />
        </div>
      </div>
      <div className="flex-1 rounded-[1.2rem] border border-slate-200 bg-slate-50 p-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-xs font-800 text-emerald-700">
          {t('home.homeVisuals.reports.csv')}
        </div>
        <div className="mt-3 space-y-2">
          <div className="h-2 rounded-full bg-slate-200" />
          <div className="h-2 w-3/5 rounded-full bg-slate-200" />
        </div>
      </div>
    </div>
  );
}

function RecurringVisual() {
  const { t } = useTranslation('public');

  return (
    <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-3">
        <div className="w-20 rounded-xl border border-slate-200 bg-white p-2">
          <div className="mb-2 flex items-center justify-between text-[9px] font-800 uppercase tracking-[0.16em] text-slate-400">
            <span>{t('home.homeVisuals.recurring.month')}</span>
            <span>12</span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 8 }, (_, index) => (
              <span
                key={index}
                className={`h-2 rounded-full ${index === 2 || index === 5 ? 'bg-cyan-400' : 'bg-slate-200'}`}
              />
            ))}
          </div>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-100">
          <RefreshCw size={18} className="text-cyan-700" />
        </div>
      </div>
    </div>
  );
}

function SecurityVisual() {
  const { t } = useTranslation('public');

  return (
    <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-cyan-100">
          <Shield size={26} className="text-emerald-700" />
        </div>
        <div className="flex-1 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-700 uppercase tracking-[0.16em] text-slate-500">{t('home.homeVisuals.security.vault')}</span>
            <Lock size={12} className="text-slate-500" />
          </div>
          <div className="mt-3 flex gap-1.5">
            <span className="h-8 flex-1 rounded-lg bg-slate-200" />
            <span className="h-8 flex-1 rounded-lg bg-cyan-200" />
            <span className="h-8 flex-1 rounded-lg bg-slate-200" />
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardPreview() {
  const { t } = useTranslation('public');
  const previewAmounts = {
    totalBalance: formatCurrencyText(12480, { currencyCode: 'USD' }),
    income: formatCurrencyText(4200, { currencyCode: 'USD' }),
    expenses: formatCurrencyText(-2760, { currencyCode: 'USD' }),
    netFlow: formatCurrencyText(1440, { currencyCode: 'USD' }),
  };

  return (
    <div className="relative mx-auto mt-6 w-full max-w-[748px] pb-10 pt-3 sm:px-2 lg:mt-0 lg:pb-6 lg:pl-5 lg:pr-8">
      <div className="absolute inset-x-12 top-8 h-44 rounded-full bg-cyan-400/18 blur-3xl" />

      <div className="relative overflow-hidden rounded-[1.7rem] border border-white/10 bg-[#071a34]/95 shadow-[0_26px_78px_rgba(2,12,32,0.44)]">
        <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-3.5 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          <div className="ml-2 flex h-8 flex-1 items-center rounded-full border border-white/10 bg-[#081323] px-4 text-[10px] text-slate-400">
            {t('home.preview.dashboardUrl')}
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] text-slate-300 md:flex">
            <Sparkles size={11} className="text-cyan-300" />
            {t('home.ai.badge', { defaultValue: 'AI-ready' })}
          </div>
        </div>

        <div className="grid md:grid-cols-[78px_minmax(0,1fr)]">
          <aside className="hidden border-r border-white/10 bg-[#061426]/90 p-2.5 md:block">
            <div className="flex flex-col items-center gap-2.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                <AppLogo size={28} />
              </div>
              {[BarChart3, Wallet, PieChart, FileText, Sparkles].map((Icon, index) => (
                <div
                  key={index}
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${
                    index === 0
                      ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200'
                      : 'border-white/5 bg-white/5 text-slate-400'
                  }`}
                >
                  <Icon size={17} />
                </div>
              ))}
            </div>
          </aside>

          <div className="relative bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_28%),linear-gradient(180deg,#08192f_0%,#061222_100%)] p-3.5 sm:p-4.5 lg:p-5">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-700 uppercase tracking-[0.2em] text-cyan-300/80">
                  {t('home.preview.brandName', { defaultValue: 'Smart Pocket' })}
                </p>
                <h3 className="mt-1.5 text-base font-700 text-white sm:text-lg">
                  {t('home.preview.balance')}
                </h3>
                <p className="mt-1 text-xs text-slate-300 sm:text-sm">{t('home.hero.subtitle')}</p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  {t('home.preview.balance')}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{t('home.preview.range30Days')}</span>
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: t('home.preview.totalBalance'), value: previewAmounts.totalBalance, tone: 'text-white' },
                { label: t('home.preview.income'), value: previewAmounts.income, tone: 'text-emerald-300' },
                { label: t('home.preview.expenses'), value: previewAmounts.expenses, tone: 'text-rose-300' },
                { label: t('home.preview.netFlow'), value: previewAmounts.netFlow, tone: 'text-cyan-300' },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                >
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    {metric.label}
                  </p>
                  <p className={`mt-1.5 text-base font-800 sm:text-lg ${metric.tone}`}>{metric.value}</p>
                  <div className="mt-2.5 flex h-6 items-end gap-1">
                    {[30, 42, 36, 52, 44, 60].map((height, index) => (
                      <span
                        key={`${metric.label}-${index}`}
                        className="flex-1 rounded-t-full bg-gradient-to-t from-cyan-500/30 to-cyan-300/70"
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(232px,0.82fr)]">
              <div className="rounded-[1.45rem] border border-white/10 bg-[#07192d]/95 p-3.5 shadow-[0_18px_40px_rgba(2,12,32,0.35)]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-700 uppercase tracking-[0.18em] text-slate-400">
                    {t('home.preview.incomeVsExpenses')}
                  </p>
                  <div className="hidden items-center gap-3 text-[10px] text-slate-400 sm:flex">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-cyan-300" />
                      {t('home.preview.income')}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-violet-400" />
                      {t('home.preview.expenses')}
                    </span>
                  </div>
                </div>
                <div className="grid h-32 grid-cols-8 items-end gap-2 sm:gap-2.5">
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
                      <div
                        className="rounded-t-2xl bg-gradient-to-t from-cyan-600 to-cyan-300"
                        style={{ height: `${incomeHeight}%` }}
                      />
                      <div
                        className="rounded-t-2xl bg-gradient-to-t from-fuchsia-700 to-violet-400"
                        style={{ height: `${expenseHeight}%` }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.45rem] border border-white/10 bg-[#07192d]/95 p-3.5">
                <p className="text-xs font-700 uppercase tracking-[0.18em] text-slate-400">
                  {t('home.preview.spendingByCategory')}
                </p>
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <svg viewBox="0 0 120 120" className="mx-auto h-20 w-20">
                    <circle cx="60" cy="60" r="42" fill="none" stroke="rgba(148,163,184,0.16)" strokeWidth="16" />
                    <circle cx="60" cy="60" r="42" fill="none" stroke="#22d3ee" strokeWidth="16" strokeDasharray="88 264" strokeLinecap="round" />
                    <circle cx="60" cy="60" r="42" fill="none" stroke="#8b5cf6" strokeWidth="16" strokeDasharray="68 264" strokeDashoffset="-94" strokeLinecap="round" />
                    <circle cx="60" cy="60" r="42" fill="none" stroke="#38bdf8" strokeWidth="16" strokeDasharray="44 264" strokeDashoffset="-166" strokeLinecap="round" />
                    <circle cx="60" cy="60" r="28" fill="#07192d" />
                  </svg>
                  <div className="mt-3 space-y-2.5">
                    {[
                      { label: t('home.preview.food'), amount: '42%', tone: 'bg-cyan-300' },
                      { label: t('home.preview.transport'), amount: '31%', tone: 'bg-violet-400' },
                      { label: t('home.preview.bills'), amount: '18%', tone: 'bg-sky-400' },
                    ].map((category) => (
                      <div key={category.label} className="flex items-center justify-between text-xs text-slate-300">
                        <span className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${category.tone}`} />
                          {category.label}
                        </span>
                        <span>{category.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute right-2 top-1 hidden w-48 rounded-[1.25rem] border border-cyan-300/20 bg-[#0a1f38]/95 p-3.5 text-white shadow-[0_16px_34px_rgba(2,12,32,0.36)] md:block">
        <div className="flex items-center gap-2 text-[11px] font-700 uppercase tracking-[0.18em] text-cyan-300">
          <TrendingUp size={13} />
          {t('home.preview.smartEntry.title')}
        </div>
        <p className="mt-2.5 text-xs font-600 leading-5 text-slate-100">
          {t('home.preview.smartEntry.description')}
        </p>
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-2.5">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-slate-400">
            <span>{t('home.preview.smartEntry.draft')}</span>
            <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-cyan-200">{t('home.preview.smartEntry.ai')}</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-white/10">
            <div className="h-2 w-3/4 rounded-full bg-cyan-400" />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-14 left-2 hidden w-48 rounded-[1.25rem] border border-white/10 bg-[#091c33]/95 p-3.5 text-white shadow-[0_16px_34px_rgba(2,12,32,0.34)] lg:block">
        <div className="flex items-center gap-2 text-[11px] font-700 uppercase tracking-[0.18em] text-cyan-300">
          <Bot size={13} />
          {t('home.preview.aiInsight.title')}
        </div>
        <p className="mt-2.5 text-xs leading-5 text-slate-200">
          {t('home.preview.aiInsight.description')}
        </p>
        <div className="mt-2.5 flex items-center gap-2 text-[11px] text-emerald-300">
          <CheckCircle2 size={14} />
          {t('home.preview.aiInsight.status')}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-10 right-8 hidden w-44 rounded-[1.25rem] border border-white/10 bg-[#0b2039]/95 p-3.5 text-white shadow-[0_16px_34px_rgba(2,12,32,0.34)] sm:block">
        <div className="flex items-center justify-between text-[11px] font-700 uppercase tracking-[0.18em] text-slate-300">
          <span>{t('home.preview.upcomingBill.title')}</span>
          <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-amber-200">{t('home.preview.upcomingBill.dueIn')}</span>
        </div>
        <p className="mt-2.5 text-sm font-700 text-white">{t('home.preview.upcomingBill.item')}</p>
        <p className="mt-1 text-xs text-slate-300">{formatCurrencyText(180, { currencyCode: 'USD' })}</p>
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
  const heroSubtitle =
    canUseSingleLanguageHeroOverride && hero.hero_subtitle ? hero.hero_subtitle : t('home.hero.subtitle');
  const heroCTAPrimary =
    canUseSingleLanguageHeroOverride && hero.hero_cta_primary ? hero.hero_cta_primary : t('home.hero.primaryCta');
  const heroCTASecondary =
    canUseSingleLanguageHeroOverride && hero.hero_cta_secondary ? hero.hero_cta_secondary : t('home.hero.secondaryCta');
  const heroTitleLines = heroTitle.split('\n');
  const heroAccentIndex = Math.max(heroTitleLines.length - 1, 0);

  return (
    <div className="overflow-x-hidden bg-[#f4f7fb] text-slate-950">
      <section className="relative overflow-hidden bg-[#041229] px-4 pb-16 pt-8 text-white sm:px-6 lg:px-8 lg:pb-20 lg:pt-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.14),transparent_24%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#061426]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:gap-8">
          <div className="max-w-2xl py-5 lg:py-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-4 py-2 text-xs font-700 uppercase tracking-[0.22em] text-cyan-200">
              <Sparkles size={12} className="text-cyan-300" />
              {t('home.hero.aiBadge', { defaultValue: 'AI-powered personal finance' })}
            </div>
            <h1 className="mt-6 text-4xl font-800 leading-[0.96] tracking-tight text-white sm:text-5xl lg:text-6xl xl:text-[4.15rem]">
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
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
              {heroSubtitle}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/sign-up-login"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-7 py-4 text-base font-700 text-slate-950 shadow-[0_18px_40px_rgba(34,211,238,0.25)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#041229] motion-reduce:transform-none"
              >
                {heroCTAPrimary}
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/home#about"
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-7 py-4 text-base font-700 text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#041229]"
              >
                {heroCTASecondary}
              </Link>
            </div>
            <div className="mt-6 grid max-w-lg gap-x-5 gap-y-3 text-sm text-slate-300 sm:grid-cols-2">
              <span className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-emerald-300" />
                {t('home.trust.noCard')}
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-emerald-300" />
                {t('home.trust.freePlan')}
              </span>
              <span className="flex items-center gap-2 sm:col-span-2">
                <CheckCircle2 size={15} className="text-emerald-300" />
                {t('home.trust.oauthEnabled')}
              </span>
            </div>
          </div>
          <DashboardPreview />
        </div>
      </section>

      <section id="about" className="scroll-mt-28 px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
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

          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-12">
            <FeatureCard
              icon={Wallet}
              title={t('home.features.accountsTitle')}
              description={t('home.features.accountsDescription')}
              visual={<MultiAccountVisual />}
              visualClassName="max-w-none"
              className="lg:col-span-4 lg:row-span-2"
            />
            <FeatureCard
              icon={BarChart3}
              title={t('home.features.dashboardTitle')}
              description={t('home.features.dashboardDescription')}
              visual={<DashboardMiniVisual />}
              className="lg:col-span-4"
            />
            <FeatureCard
              icon={PieChart}
              title={t('home.features.budgetsTitle')}
              description={t('home.features.budgetsDescription')}
              visual={<BudgetVisual />}
              className="lg:col-span-4"
            />
            <FeatureCard
              icon={FileText}
              title={t('home.features.exportsTitle')}
              description={t('home.features.exportsDescription')}
              visual={<ReportsVisual />}
              className="lg:col-span-3"
            />
            <FeatureCard
              icon={RefreshCw}
              title={t('home.features.recurringTitle')}
              description={t('home.features.recurringDescription')}
              visual={<RecurringVisual />}
              className="lg:col-span-3"
            />
            <FeatureCard
              icon={Shield}
              title={t('home.features.securityTitle')}
              description={t('home.features.securityDescription')}
              visual={<SecurityVisual />}
              className="lg:col-span-3"
            />
            <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)] lg:col-span-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-100 to-sky-50">
                  <TrendingUp size={20} className="text-cyan-700" />
                </div>
                <div>
                  <p className="text-lg font-800 tracking-tight text-slate-950">{t('home.summary.title')}</p>
                  <p className="text-sm text-slate-500">{t('home.summary.subtitle')}</p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {[
                  t('home.summary.items.cashFlow'),
                  t('home.summary.items.budgets'),
                  t('home.summary.items.reports'),
                ].map((item, index) => (
                  <div key={item} className="rounded-2xl bg-slate-50 px-3.5 py-3">
                    <div className="flex items-center justify-between text-sm font-700 text-slate-800">
                      <span>{item}</span>
                      <span className="text-cyan-700">{index + 1}/3</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-200">
                      <div
                        className="h-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-sky-400"
                        style={{ width: `${72 - index * 18}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-28 px-4 pb-16 sm:px-6 lg:px-8 lg:pb-20">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.2rem] bg-[#041229] text-white shadow-[0_24px_80px_rgba(2,12,32,0.22)]">
          <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-10 lg:py-10">
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
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  t('home.benefits.balanceTitle'),
                  t('home.benefits.reportsTitle'),
                  t('home.security.rlsTitle'),
                  t('home.sections.platformTitle'),
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                    <CheckCircle2 size={16} className="text-emerald-300" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute left-1/2 top-16 h-56 w-56 -translate-x-1/2 rounded-full bg-cyan-400/20 blur-3xl" />
              <div className="relative rounded-[1.9rem] border border-white/10 bg-white/6 p-5 shadow-[0_18px_36px_rgba(2,12,32,0.24)] sm:p-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/12">
                      <Bot size={21} className="text-cyan-300" />
                    </div>
                    <div>
                      <p className="text-sm font-700 text-white">{t('home.ai.badge')}</p>
                      <p className="text-xs text-slate-400">{t('home.ai.roadmap.previewLabel')}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-[11px] font-700 uppercase tracking-[0.12em] text-cyan-200">
                    {t('home.ai.planned')}
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    { icon: BarChart3, title: t('home.ai.features.1'), desc: t('home.ai.roadmap.descriptions.1') },
                    { icon: Sparkles, title: t('home.ai.features.2'), desc: t('home.ai.roadmap.descriptions.2') },
                    { icon: PieChart, title: t('home.ai.features.3'), desc: t('home.ai.roadmap.descriptions.3') },
                    { icon: Shield, title: t('home.ai.features.4'), desc: t('home.ai.roadmap.descriptions.4') },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className="rounded-[1.35rem] border border-white/10 bg-[#07192d]/90 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/12">
                            <Icon size={18} className="text-cyan-300" />
                          </div>
                          <span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-[10px] font-700 uppercase tracking-[0.12em] text-cyan-200">
                            {t('home.ai.planned')}
                          </span>
                        </div>
                        <p className="mt-4 text-sm font-700 text-white">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{item.desc}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 rounded-[1.35rem] border border-white/10 bg-[#07192d]/90 p-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{t('home.ai.roadmap.cashFlowSignal')}</span>
                    <span className="text-emerald-300">{t('home.ai.badge')}</span>
                  </div>
                  <div className="mt-3 flex h-16 items-end gap-2">
                    {[24, 34, 30, 42, 50, 46, 58, 52].map((height, index) => (
                      <span
                        key={index}
                        className="flex-1 rounded-t-full bg-gradient-to-t from-cyan-600 to-cyan-300"
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 lg:px-8 lg:pb-20">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-3">
          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
            <h3 className="text-xl font-800 text-slate-950">{t('home.sections.stepsTitle')}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t('home.sections.stepsDescription')}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {HOW_IT_WORKS.slice(0, 4).map((step, index) => (
                <div
                  key={step.id}
                  className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-700 text-slate-700"
                >
                  <span className="text-cyan-600">{String(index + 1).padStart(2, '0')}</span>
                  {t(`home.steps.${step.id}Title`)}
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
            <h3 className="text-xl font-800 text-slate-950">{t('home.sections.platformTitle')}</h3>
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
          </article>

          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
            <h3 className="text-xl font-800 text-slate-950">{t('home.security.heading')}</h3>
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
          </article>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
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
              <div className="mt-5 flex flex-wrap gap-3">
                {LANGUAGES.map((languageOption) => (
                  <div
                    key={languageOption.code}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <p className="text-sm font-700 text-slate-900">{t(languageOption.nameKey)}</p>
                    <p className="mt-1 text-xs text-slate-500">{t(languageOption.dirKey)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[1.6rem] border border-slate-200 bg-slate-50 p-5 md:col-span-2">
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
              <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5">
                <p className="text-xs font-700 uppercase tracking-[0.18em] text-slate-500">
                  {t('home.currency.title')}
                </p>
                <div className="mt-4 space-y-3">
                  {[
                    { code: 'USD', name: t('home.currency.usd'), sample: formatCurrencyText(1250, { currencyCode: 'USD' }) },
                    { code: 'EUR', name: t('home.currency.eur'), sample: formatCurrencyText(1250, { currencyCode: 'EUR' }) },
                    { code: 'AED', name: t('home.currency.aed'), sample: formatCurrencyText(1250, { currencyCode: 'AED' }) },
                  ].map((currency) => (
                    <div
                      key={currency.code}
                      className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2"
                    >
                      <span className="text-sm font-600 text-slate-900">{currency.name}</span>
                      <span className="text-xs font-700 text-cyan-700">{currency.sample}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5">
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

      <section className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 rounded-[1.75rem] bg-gradient-to-r from-cyan-500 via-sky-500 to-violet-600 px-6 py-6 text-center text-white shadow-[0_18px_45px_rgba(14,116,144,0.22)] md:flex-row md:text-left">
          <div>
            <p className="text-2xl font-800 tracking-tight sm:text-3xl">{t('home.sections.ctaTitle')}</p>
            <p className="mt-2 max-w-2xl text-sm text-cyan-50 sm:text-base">
              {t('home.sections.ctaDescription')}
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/sign-up-login"
              className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 text-sm font-700 text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-cyan-600"
            >
              {t('home.cta.primary')}
            </Link>
            <Link
              href="/home#about"
              className="inline-flex items-center justify-center rounded-2xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-700 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-cyan-600"
            >
              {t('home.learnMore')}
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
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
              defaultValue:
                'Whether you need help getting started, have a feature request, or want to discuss pricing, our team is ready to help.',
            })}
          </p>
          <Link
            href="/contact"
            className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-8 py-4 text-base font-700 text-white shadow-[0_16px_30px_rgba(15,23,42,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
          >
            <Mail size={18} />
            {t('home.cta.secondary')}
          </Link>
        </div>
      </section>

      <section className="px-4 pb-24 sm:px-6 lg:px-8">
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
