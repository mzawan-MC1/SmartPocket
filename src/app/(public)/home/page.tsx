'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BarChart3, Wallet, PieChart, Shield, Smartphone, TrendingUp, FileText, RefreshCw, Bell, Lock, Download, CheckCircle2, Monitor, Tablet, Zap, Languages, Star, ChevronRight, Mail, Apple, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AppLogo from '@/components/ui/AppLogo';
import { getPlatformSettings } from '@/lib/finance';
import { formatCurrencyText } from '@/lib/currency-formatting';

interface HeroSettings {
  hero_title?: string;
  hero_subtitle?: string;
  hero_cta_primary?: string;
  hero_cta_secondary?: string;
  app_name?: string;
}

const BENEFITS = [
  { id: 'balance', icon: TrendingUp },
  { id: 'budgetAlerts', icon: PieChart },
  { id: 'reports', icon: FileText },
  { id: 'recurring', icon: RefreshCw },
  { id: 'reminders', icon: Bell },
  { id: 'rls', icon: Lock },
] as const;

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

const PLANS = [
  { id: 'free', accent: false, featureCount: 4 },
  { id: 'pro', accent: true, featureCount: 6 },
  { id: 'family', accent: false, featureCount: 4 },
] as const;

/** Inline SVG dashboard preview — no external assets required */
function DashboardPreview() {
  const { t } = useTranslation('public');
  const previewAmounts = {
    totalBalance: formatCurrencyText(12480, { currencyCode: 'USD' }),
    income: formatCurrencyText(4200, { currencyCode: 'USD' }),
    expenses: formatCurrencyText(-2760, { currencyCode: 'USD' }),
    netFlow: formatCurrencyText(1440, { currencyCode: 'USD' }),
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto mt-12">
      {/* Glow backdrop */}
      <div className="absolute inset-0 bg-gradient-to-b from-accent/10 to-primary/5 rounded-3xl blur-2xl scale-105 pointer-events-none" />

      {/* Browser chrome */}
      <div className="relative rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Browser top bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/40">
          <span className="w-3 h-3 rounded-full bg-red-400/70" />
          <span className="w-3 h-3 rounded-full bg-yellow-400/70" />
          <span className="w-3 h-3 rounded-full bg-green-400/70" />
          <div className="flex-1 mx-4 h-6 rounded-md bg-muted/60 flex items-center px-3">
            <span className="text-[10px] text-muted-foreground">smartpocket.app/dashboard</span>
          </div>
        </div>

        {/* Dashboard body */}
        <div className="p-4 sm:p-6 bg-background">
          {/* Top metrics row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: t('home.preview.totalBalance'), value: previewAmounts.totalBalance, color: 'text-foreground', bg: 'bg-accent/8' },
              { label: t('home.preview.income'), value: previewAmounts.income, color: 'text-positive', bg: 'bg-positive/8' },
              { label: t('home.preview.expenses'), value: previewAmounts.expenses, color: 'text-destructive', bg: 'bg-destructive/8' },
              { label: t('home.preview.netFlow'), value: previewAmounts.netFlow, color: 'text-accent', bg: 'bg-accent/8' },
            ].map((m) => (
              <div key={m.label} className={`rounded-xl p-3 ${m.bg} border border-border`}>
                <p className="text-[10px] text-muted-foreground mb-1">{m.label}</p>
                <p className={`text-base font-800 ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            {/* Bar chart mock */}
            <div className="sm:col-span-2 rounded-xl border border-border bg-card p-4">
              <p className="text-[10px] font-700 text-muted-foreground uppercase tracking-wider mb-3">{t('home.preview.incomeVsExpenses')}</p>
              <div className="flex items-end gap-2 h-20">
                {[
                  { inc: 65, exp: 45 },
                  { inc: 72, exp: 55 },
                  { inc: 58, exp: 48 },
                  { inc: 80, exp: 60 },
                  { inc: 75, exp: 52 },
                  { inc: 88, exp: 58 },
                ].map((bar, i) => (
                  <div key={i} className="flex-1 flex items-end gap-0.5">
                    <div className="flex-1 rounded-t-sm bg-positive/50" style={{ height: `${bar.inc}%` }} />
                    <div className="flex-1 rounded-t-sm bg-destructive/40" style={{ height: `${bar.exp}%` }} />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-2">
                <span className="flex items-center gap-1 text-[9px] text-muted-foreground"><span className="w-2 h-2 rounded-sm bg-positive/50 inline-block" />{t('home.preview.income')}</span>
                <span className="flex items-center gap-1 text-[9px] text-muted-foreground"><span className="w-2 h-2 rounded-sm bg-destructive/40 inline-block" />{t('home.preview.expenses')}</span>
              </div>
            </div>

            {/* Donut mock */}
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col">
              <p className="text-[10px] font-700 text-muted-foreground uppercase tracking-wider mb-3">{t('home.preview.spendingByCategory')}</p>
              <div className="flex-1 flex items-center justify-center">
                <svg viewBox="0 0 80 80" className="w-16 h-16">
                  <circle cx="40" cy="40" r="28" fill="none" stroke="hsl(var(--accent)/0.15)" strokeWidth="14" />
                  <circle cx="40" cy="40" r="28" fill="none" stroke="hsl(var(--accent))" strokeWidth="14"
                    strokeDasharray="52 124" strokeDashoffset="0" strokeLinecap="round" />
                  <circle cx="40" cy="40" r="28" fill="none" stroke="hsl(var(--positive))" strokeWidth="14"
                    strokeDasharray="35 124" strokeDashoffset="-52" strokeLinecap="round" />
                  <circle cx="40" cy="40" r="28" fill="none" stroke="hsl(var(--destructive)/0.6)" strokeWidth="14"
                    strokeDasharray="25 124" strokeDashoffset="-87" strokeLinecap="round" />
                  <circle cx="40" cy="40" r="22" fill="hsl(var(--card))" />
                </svg>
              </div>
              <div className="space-y-1 mt-2">
                {[
                  { label: t('home.preview.food'), color: 'bg-accent' },
                  { label: t('home.preview.transport'), color: 'bg-positive' },
                  { label: t('home.preview.bills'), color: 'bg-destructive/60' },
                ].map((c) => (
                  <div key={c.label} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${c.color} flex-shrink-0`} />
                    <span className="text-[9px] text-muted-foreground">{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent transactions mock */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[10px] font-700 text-muted-foreground uppercase tracking-wider mb-3">{t('home.preview.recentTransactions')}</p>
            <div className="space-y-2">
              {[
                { name: t('home.preview.groceryStore'), cat: t('home.preview.food'), amount: '-$84.20', color: 'text-destructive' },
                { name: t('home.preview.salaryDeposit'), cat: t('home.preview.income'), amount: '+$3,200', color: 'text-positive' },
                { name: 'Netflix', cat: t('home.preview.subscriptions'), amount: '-$15.99', color: 'text-destructive' },
              ].map((tx) => (
                <div key={tx.name} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <Wallet size={11} className="text-accent" />
                    </div>
                    <div>
                      <p className="text-[10px] font-600 text-foreground">{tx.name}</p>
                      <p className="text-[9px] text-muted-foreground">{tx.cat}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-700 ${tx.color}`}>{tx.amount}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating mobile card */}
      <div className="absolute -bottom-6 -right-4 sm:-right-8 w-28 sm:w-36 rounded-2xl border border-border bg-card shadow-xl overflow-hidden hidden sm:block">
        <div className="bg-accent px-3 py-2">
          <p className="text-[9px] font-700 text-accent-foreground uppercase tracking-wider">Smart Pocket</p>
        </div>
        <div className="p-3 space-y-2">
          <div>
            <p className="text-[8px] text-muted-foreground">{t('home.preview.balance')}</p>
            <p className="text-sm font-800 text-foreground">{previewAmounts.totalBalance}</p>
          </div>
          <div className="flex gap-1">
            <div className="flex-1 rounded-lg bg-positive/10 p-1.5 text-center">
              <p className="text-[7px] text-muted-foreground">{t('home.preview.inShort')}</p>
                <p className="text-[9px] font-700 text-positive">{formatCurrencyText(4200, { currencyCode: 'USD', compact: true })}</p>
            </div>
            <div className="flex-1 rounded-lg bg-destructive/10 p-1.5 text-center">
              <p className="text-[7px] text-muted-foreground">{t('home.preview.outShort')}</p>
                <p className="text-[9px] font-700 text-destructive">{formatCurrencyText(-2700, { currencyCode: 'USD', compact: true })}</p>
            </div>
          </div>
          <div className="flex items-end gap-0.5 h-8">
            {[40, 60, 45, 75, 55, 80, 65].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-sm bg-accent/40" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { t } = useTranslation(['public', 'common']);
  const [hero, setHero] = useState<HeroSettings>({});

  useEffect(() => {
    getPlatformSettings()
      .then((data) => {
        if (data) setHero(data as HeroSettings);
      })
      .catch(() => {});
  }, []);

  const heroTitle = hero.hero_title || t('home.hero.title');
  const heroSubtitle = hero.hero_subtitle || t('home.hero.subtitle');
  const heroCTAPrimary = hero.hero_cta_primary || t('home.hero.primaryCta');
  const heroCTASecondary = hero.hero_cta_secondary || t('home.hero.secondaryCta');
  const plans = PLANS.map((plan) => ({
    ...plan,
    name: t(`home.pricing.${plan.id}Name`),
    price: t(`home.pricing.${plan.id}Price`),
    period: t(`home.pricing.${plan.id}Period`),
    cta: t(`home.pricing.${plan.id}Cta`),
    features: Array.from({ length: plan.featureCount }, (_, index) =>
      t(`home.pricing.${plan.id}Features.${index + 1}`)
    ),
  }));

  return (
    <div className="overflow-x-hidden">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-14 pb-0 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-background to-accent/5 pointer-events-none" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-accent/5 blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-primary/5 blur-3xl pointer-events-none translate-y-1/2 -translate-x-1/3" />
        <div className="relative max-w-4xl mx-auto text-center">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-800 text-foreground tracking-tight mb-5 leading-[1.05] whitespace-pre-line">
            {heroTitle.split('\n').map((line, i) => (
              <span key={i}>
                {i === 1 ? <span className="text-accent">{line}</span> : line}
                {i < heroTitle.split('\n').length - 1 && <br />}
              </span>
            ))}
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
            {heroSubtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-5">
            <Link href="/sign-up-login" className="btn-primary text-base py-3.5 px-10 gap-2">
              {heroCTAPrimary}
              <ArrowRight size={18} />
            </Link>
            <Link href="/#features" className="btn-secondary text-base py-3.5 px-10">
              {heroCTASecondary}
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground mb-4">
            <span className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-positive" /> {t('home.trust.noCard')}</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-positive" /> {t('home.trust.freePlan')}</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-positive" /> {t('home.trust.oauthEnabled')}</span>
          </div>

          {/* Dashboard preview */}
          <DashboardPreview />
        </div>
      </section>

      {/* Spacer to account for floating mobile card */}
      <div className="h-16 sm:h-20" />

      {/* ── Product Overview ─────────────────────────────────────────────── */}
      <section id="about" className="scroll-mt-28 py-20 px-4 bg-card/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-800 text-foreground mb-4">{t('home.sections.aboutTitle')}</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">{t('home.sections.aboutDescription')}</p>
          </div>
          {/* Bento grid — varied sizes */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => {
              const FIcon = f.icon;
              const isLarge = f.size === 'large';
              const isMedium = f.size === 'medium';
              return (
                <div
                  key={f.id}
                  className={`card-elevated p-6 flex flex-col gap-3 ${isLarge ? 'col-span-2 lg:col-span-2 row-span-2' : ''} ${isMedium ? 'col-span-2 lg:col-span-1' : ''}`}
                >
                  <div className={`rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0 ${isLarge ? 'w-14 h-14' : 'w-10 h-10'}`}>
                    <FIcon size={isLarge ? 26 : 18} className="text-accent" />
                  </div>
                  <h3 className={`font-700 text-foreground ${isLarge ? 'text-xl' : 'text-base'}`}>{t(`home.features.${f.id}Title`)}</h3>
                  <p className={`text-muted-foreground leading-relaxed ${isLarge ? 'text-base' : 'text-sm'}`}>{t(`home.features.${f.id}Description`)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Key Benefits ─────────────────────────────────────────────────── */}
      <section id="features" className="scroll-mt-28 py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-800 text-foreground mb-4">{t('home.sections.featuresTitle')}</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">{t('home.sections.featuresDescription')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {BENEFITS.map((b) => {
              const BIcon = b.icon;
              return (
                <div key={b.id} className="flex gap-4 p-5 rounded-2xl border border-border hover:border-accent/30 hover:bg-accent/3 transition-all">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <BIcon size={17} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-700 text-foreground mb-1">{t(`home.benefits.${b.id}Title`)}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{t(`home.benefits.${b.id}Description`)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-primary/4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-800 text-foreground mb-4">{t('home.sections.stepsTitle')}</h2>
            <p className="text-muted-foreground">{t('home.sections.stepsDescription')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.id} className="relative">
                <div className="card-elevated p-5 h-full">
                  <div className="text-3xl font-800 text-accent/20 mb-3">{step.step}</div>
                  <h3 className="text-sm font-700 text-foreground mb-2">{t(`home.steps.${step.id}Title`)}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{t(`home.steps.${step.id}Description`)}</p>
                </div>
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden lg:flex absolute top-1/2 -right-2 -translate-y-1/2 z-10">
                    <ChevronRight size={16} className="text-accent/40" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Platform Availability ─────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-800 text-foreground mb-4">{t('home.sections.platformTitle')}</h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">{t('home.sections.platformDescription')}</p>
              <div className="space-y-4">
                {[
                  { icon: Smartphone, label: t('home.platform.mobileTitle'), desc: t('home.platform.mobileDescription') },
                  { icon: Monitor, label: t('home.platform.desktopTitle'), desc: t('home.platform.desktopDescription') },
                  { icon: Tablet, label: t('home.platform.tabletTitle'), desc: t('home.platform.tabletDescription') },
                ].map((p) => {
                  const PIcon = p.icon;
                  return (
                    <div key={p.label} className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                        <PIcon size={18} className="text-accent" />
                      </div>
                      <div>
                        <p className="text-sm font-600 text-foreground">{p.label}</p>
                        <p className="text-xs text-muted-foreground">{p.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="card-elevated p-6 col-span-2 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-positive/10 flex items-center justify-center flex-shrink-0">
                  <Zap size={22} className="text-positive" />
                </div>
                <div>
                  <p className="font-700 text-foreground">{t('home.platform.pwaTitle')}</p>
                  <p className="text-sm text-muted-foreground">{t('home.platform.pwaDescription')}</p>
                </div>
              </div>
              <div className="card-elevated p-5 flex flex-col items-center text-center gap-2">
                <Apple size={28} className="text-foreground" />
                <p className="text-sm font-600 text-foreground">{t('home.auth.apple')}</p>
                <p className="text-xs text-muted-foreground">{t('home.available')}</p>
              </div>
              <div className="card-elevated p-5 flex flex-col items-center text-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path d="M12 6a6 6 0 1 1 0 12A6 6 0 0 1 12 6z"/><path d="M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>
                <p className="text-sm font-600 text-foreground">{t('home.auth.google')}</p>
                <p className="text-xs text-muted-foreground">{t('home.available')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Security & Privacy ───────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-card/50">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="grid grid-cols-2 gap-4 order-2 lg:order-1">
                {[
                  { icon: Lock, id: 'rls' },
                  { icon: Shield, id: 'transit' },
                  { icon: Shield, id: 'rest' },
                  { icon: CheckCircle2, id: 'privacy' },
                ].map((s) => {
                const SIcon = s.icon;
                return (
                  <div key={s.id} className="card-elevated p-5">
                    <div className="w-9 h-9 rounded-lg bg-positive/10 flex items-center justify-center mb-3">
                      <SIcon size={17} className="text-positive" />
                    </div>
                    <p className="text-sm font-700 text-foreground mb-1">{t(`home.security.${s.id}Title`)}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{t(`home.security.${s.id}Description`)}</p>
                  </div>
                );
              })}
            </div>
            <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 text-xs font-700 uppercase tracking-widest text-positive bg-positive/10 px-3 py-1.5 rounded-full mb-6">
                <Shield size={12} /> {t('home.security.label')}
              </div>
              <h2 className="text-3xl sm:text-4xl font-800 text-foreground mb-4">{t('home.security.heading')}</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">{t('home.security.body')}</p>
              <Link href="/privacy" className="inline-flex items-center gap-2 text-sm font-600 text-accent hover:underline">
                {t('home.security.readPrivacy')} <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Multilingual Support ─────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-700 uppercase tracking-widest text-accent bg-accent/10 px-3 py-1.5 rounded-full mb-6">
                <Languages size={12} /> {t('home.languages.label')}
              </div>
              <h2 className="text-3xl sm:text-4xl font-800 text-foreground mb-4">{t('home.sections.languagesTitle')}</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">{t('home.sections.languagesDescription')}</p>
              <div className="flex flex-wrap gap-3">
                {LANGUAGES.map((l) => (
                  <div key={l.code} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card">
                    <span className="text-sm font-700 text-foreground">{t(l.nameKey)}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{t(l.dirKey)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card-elevated p-8 space-y-4">
              <p className="text-xs font-700 uppercase tracking-widest text-muted-foreground mb-4">{t('home.currency.title')}</p>
              {[
                { code: 'USD', name: t('home.currency.usd'), sample: formatCurrencyText(1250, { currencyCode: 'USD' }) },
                { code: 'EUR', name: t('home.currency.eur'), sample: formatCurrencyText(1250, { currencyCode: 'EUR' }) },
                { code: 'AED', name: t('home.currency.aed'), sample: formatCurrencyText(1250, { currencyCode: 'AED' }) },
                { code: 'GBP', name: t('home.currency.gbp'), sample: formatCurrencyText(1250, { currencyCode: 'GBP' }) },
              ].map((c) => (
                <div key={c.code} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="min-w-8 rounded-lg bg-accent/10 px-2 py-1 text-xs font-700 text-accent">{c.sample}</span>
                    <span className="text-sm font-600 text-foreground">{c.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground font-600">{c.code}</span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-2">{t('home.currency.supported')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Reports & Exports ────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-primary/4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-800 text-foreground mb-4">{t('home.reports.title')}</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">{t('home.reports.description')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { icon: FileText, id: 'pdf' },
              { icon: Download, id: 'csv' },
              { icon: BarChart3, id: 'charts' },
            ].map((r) => {
              const RIcon = r.icon;
              return (
                <div key={r.id} className="card-elevated p-6">
                  <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                    <RIcon size={20} className="text-accent" />
                  </div>
                  <h3 className="text-base font-700 text-foreground mb-2">{t(`home.reports.${r.id}Title`)}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{t(`home.reports.${r.id}Description`)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── AI-Ready Positioning ─────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="card-elevated p-10 lg:p-14 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-accent/5 blur-3xl pointer-events-none" />
            <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-700 uppercase tracking-widest text-accent bg-accent/10 px-3 py-1.5 rounded-full mb-6">
                  <Sparkles size={12} /> {t('home.ai.badge')}
                </div>
                <h2 className="text-2xl sm:text-3xl font-800 text-foreground mb-4">{t('home.ai.title')}</h2>
                <p className="text-muted-foreground leading-relaxed">{t('home.ai.description')}</p>
              </div>
              <div className="space-y-3">
                {[
                  t('home.ai.features.1'),
                  t('home.ai.features.2'),
                  t('home.ai.features.3'),
                  t('home.ai.features.4'),
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                    <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                      <Sparkles size={11} className="text-accent" />
                    </div>
                    <span className="text-sm text-muted-foreground">{item}</span>
                    <span className="ml-auto text-xs font-600 text-accent/60 bg-accent/10 px-2 py-0.5 rounded-full">{t('home.ai.planned')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing Teaser ───────────────────────────────────────────────── */}
      <section id="pricing" className="scroll-mt-28 py-20 px-4 bg-card/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-800 text-foreground mb-4">{t('home.sections.pricingTitle')}</h2>
            <p className="text-muted-foreground">{t('home.pricing.subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div key={plan.id} className={`card-elevated p-6 relative flex flex-col ${plan.accent ? 'border-accent border-2' : ''}`}>
                {plan.accent && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-700 bg-accent text-accent-foreground px-3 py-1 rounded-full">{t('home.pricing.mostPopular')}</span>
                )}
                <div className="mb-5">
                  <h3 className="text-lg font-700 text-foreground">{plan.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-800 text-foreground">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </div>
                </div>
                <ul className="space-y-2.5 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 size={14} className="text-positive flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/sign-up-login"
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-600 transition-all ${plan.accent ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {plan.cta} <ArrowRight size={14} />
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground mt-8">
            {t('home.pricing.trialHint')}
          </p>
          <div className="text-center mt-4">
            <Link href="/#pricing" className="inline-flex items-center gap-1.5 text-sm font-600 text-accent hover:underline">
              {t('home.pricing.viewDetails')} <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Contact CTA ──────────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 text-xs font-700 uppercase tracking-widest text-muted-foreground bg-muted px-3 py-1.5 rounded-full mb-6">
            <Mail size={12} /> {t('home.contact.badge')}
          </div>
          <h2 className="text-3xl sm:text-4xl font-800 text-foreground mb-4">{t('home.contact.title')}</h2>
          <p className="text-muted-foreground mb-8 leading-relaxed">{t('home.contact.description')}</p>
          <Link href="/contact" className="btn-primary text-base py-3.5 px-10 mx-auto gap-2">
            <Mail size={18} /> {t('home.cta.secondary')}
          </Link>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/5 to-background pointer-events-none" />
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="flex items-center justify-center mb-6">
            <AppLogo size={52} />
          </div>
          <h2 className="text-4xl sm:text-5xl font-800 text-foreground mb-4 tracking-tight">{t('home.sections.ctaTitle')}</h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed">{t('home.sections.ctaDescription')}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sign-up-login" className="btn-primary text-base py-3.5 px-10 gap-2">
              {t('home.cta.primary')} <ArrowRight size={18} />
            </Link>
            <Link href="/#about" className="btn-secondary text-base py-3.5 px-10">
              {t('home.learnMore')}
            </Link>
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-8">
            {[1,2,3,4,5].map((s) => <Star key={s} size={14} className="text-amber-400 fill-amber-400" />)}
            <span className="text-sm text-muted-foreground ml-2">{t('home.lovedWorldwide')}</span>
          </div>
        </div>
      </section>

    </div>
  );
}
