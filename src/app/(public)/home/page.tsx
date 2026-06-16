'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BarChart3, Wallet, PieChart, Shield, Smartphone, TrendingUp, FileText, RefreshCw, Bell, Lock, Download, CheckCircle2, Monitor, Tablet, Zap, Languages, Star, ChevronRight, Mail, Apple, Sparkles } from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import { getPlatformSettings } from '@/lib/finance';

interface HeroSettings {
  hero_title?: string;
  hero_subtitle?: string;
  hero_cta_primary?: string;
  hero_cta_secondary?: string;
  app_name?: string;
}

const BENEFITS = [
  { icon: TrendingUp, title: 'Real-time balance tracking', desc: 'See every account balance update the moment a transaction is recorded.' },
  { icon: PieChart, title: 'Budget alerts before overspend', desc: 'Get notified when you are approaching your category budget limit.' },
  { icon: FileText, title: 'PDF & CSV reports on demand', desc: 'Generate professional financial statements for any date range instantly.' },
  { icon: RefreshCw, title: 'Recurring transaction automation', desc: 'Set up subscriptions and recurring bills once — Smart Pocket tracks them.' },
  { icon: Bell, title: 'Upcoming payment reminders', desc: 'Never miss a bill. Dashboard shows what is due in the next 7 days.' },
  { icon: Lock, title: 'Row-level data isolation', desc: 'Your data is invisible to every other user — enforced at the database level.' },
];

const FEATURES = [
  { icon: Wallet, title: 'Multi-Account Management', desc: 'Bank accounts, credit cards, cash, savings, digital wallets — all in one place with real-time balances.', size: 'large' },
  { icon: BarChart3, title: 'Smart Dashboard', desc: 'Income vs expense trends, spending by category, and net flow — all on one screen.', size: 'small' },
  { icon: PieChart, title: 'Budget Management', desc: 'Category budgets with visual progress and overspend alerts.', size: 'small' },
  { icon: FileText, title: 'Reports & Exports', desc: 'Monthly summaries, budget performance, and income/expense breakdowns. Export to PDF or CSV.', size: 'medium' },
  { icon: RefreshCw, title: 'Recurring Transactions', desc: 'Automate subscriptions, rent, and salary entries.', size: 'small' },
  { icon: Shield, title: 'Bank-Level Security', desc: 'Supabase RLS ensures only you see your data. Encrypted in transit and at rest.', size: 'medium' },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Create your account', desc: 'Sign up with email, Google, or Apple in under 30 seconds.' },
  { step: '02', title: 'Add your accounts', desc: 'Add bank accounts, credit cards, cash, or any wallet type.' },
  { step: '03', title: 'Log transactions', desc: 'Record income, expenses, and transfers. Attach receipts.' },
  { step: '04', title: 'Set budgets', desc: 'Create category budgets and watch your spending in real time.' },
  { step: '05', title: 'Review reports', desc: 'Generate PDF or CSV reports for any period. Share or archive.' },
];

const LANGUAGES = [
  { code: 'EN', name: 'English', dir: 'LTR' },
  { code: 'AR', name: 'العربية', dir: 'RTL' },
  { code: 'FR', name: 'Français', dir: 'LTR' },
  { code: 'RU', name: 'Русский', dir: 'LTR' },
];

const PLANS = [
  { id: 'free', name: 'Free', price: '$0', period: 'forever', features: ['3 accounts', '100 transactions/mo', 'Basic reports', '2 currencies'], cta: 'Start Free', accent: false },
  { id: 'pro', name: 'Pro', price: '$9.99', period: '/month', features: ['Unlimited accounts', 'Unlimited transactions', 'PDF & CSV exports', 'All currencies', 'Receipt storage', 'Priority support'], cta: 'Start Pro Trial', accent: true },
  { id: 'family', name: 'Family', price: '$19.99', period: '/month', features: ['Everything in Pro', 'Up to 5 users', 'Shared budgets', 'Family reports'], cta: 'Start Family Trial', accent: false },
];

/** Inline SVG dashboard preview — no external assets required */
function DashboardPreview() {
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
              { label: 'Total Balance', value: '$12,480', color: 'text-foreground', bg: 'bg-accent/8' },
              { label: 'Income', value: '$4,200', color: 'text-positive', bg: 'bg-positive/8' },
              { label: 'Expenses', value: '$2,760', color: 'text-destructive', bg: 'bg-destructive/8' },
              { label: 'Net Flow', value: '+$1,440', color: 'text-accent', bg: 'bg-accent/8' },
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
              <p className="text-[10px] font-700 text-muted-foreground uppercase tracking-wider mb-3">Income vs Expenses — 6 months</p>
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
                <span className="flex items-center gap-1 text-[9px] text-muted-foreground"><span className="w-2 h-2 rounded-sm bg-positive/50 inline-block" />Income</span>
                <span className="flex items-center gap-1 text-[9px] text-muted-foreground"><span className="w-2 h-2 rounded-sm bg-destructive/40 inline-block" />Expenses</span>
              </div>
            </div>

            {/* Donut mock */}
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col">
              <p className="text-[10px] font-700 text-muted-foreground uppercase tracking-wider mb-3">Spending by Category</p>
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
                  { label: 'Food', color: 'bg-accent' },
                  { label: 'Transport', color: 'bg-positive' },
                  { label: 'Bills', color: 'bg-destructive/60' },
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
            <p className="text-[10px] font-700 text-muted-foreground uppercase tracking-wider mb-3">Recent Transactions</p>
            <div className="space-y-2">
              {[
                { name: 'Grocery Store', cat: 'Food', amount: '-$84.20', color: 'text-destructive' },
                { name: 'Salary Deposit', cat: 'Income', amount: '+$3,200', color: 'text-positive' },
                { name: 'Netflix', cat: 'Subscriptions', amount: '-$15.99', color: 'text-destructive' },
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
            <p className="text-[8px] text-muted-foreground">Balance</p>
            <p className="text-sm font-800 text-foreground">$12,480</p>
          </div>
          <div className="flex gap-1">
            <div className="flex-1 rounded-lg bg-positive/10 p-1.5 text-center">
              <p className="text-[7px] text-muted-foreground">In</p>
              <p className="text-[9px] font-700 text-positive">$4.2k</p>
            </div>
            <div className="flex-1 rounded-lg bg-destructive/10 p-1.5 text-center">
              <p className="text-[7px] text-muted-foreground">Out</p>
              <p className="text-[9px] font-700 text-destructive">$2.7k</p>
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
  const [hero, setHero] = useState<HeroSettings>({});

  useEffect(() => {
    getPlatformSettings()
      .then((data) => {
        if (data) setHero(data as HeroSettings);
      })
      .catch(() => {});
  }, []);

  const heroTitle = hero.hero_title || 'Your finances,\nclearly in view';
  const heroSubtitle = hero.hero_subtitle || 'Smart Pocket tracks every account, budget, and transaction in one clean dashboard — with professional reports, multi-currency support, and bank-level security.';
  const heroCTAPrimary = hero.hero_cta_primary || 'Get Started Free';
  const heroCTASecondary = hero.hero_cta_secondary || 'See Features';

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
            <Link href="/features" className="btn-secondary text-base py-3.5 px-10">
              {heroCTASecondary}
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground mb-4">
            <span className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-positive" /> No credit card required</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-positive" /> Free plan available</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-positive" /> Sign in with Google or Apple</span>
          </div>

          {/* Dashboard preview */}
          <DashboardPreview />
        </div>
      </section>

      {/* Spacer to account for floating mobile card */}
      <div className="h-16 sm:h-20" />

      {/* ── Product Overview ─────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-card/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-800 text-foreground mb-4">One app for your entire financial life</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">From daily coffee to monthly rent — every transaction, every account, every budget in one place.</p>
          </div>
          {/* Bento grid — varied sizes */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => {
              const FIcon = f.icon;
              const isLarge = f.size === 'large';
              const isMedium = f.size === 'medium';
              return (
                <div
                  key={f.title}
                  className={`card-elevated p-6 flex flex-col gap-3 ${isLarge ? 'col-span-2 lg:col-span-2 row-span-2' : ''} ${isMedium ? 'col-span-2 lg:col-span-1' : ''}`}
                >
                  <div className={`rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0 ${isLarge ? 'w-14 h-14' : 'w-10 h-10'}`}>
                    <FIcon size={isLarge ? 26 : 18} className="text-accent" />
                  </div>
                  <h3 className={`font-700 text-foreground ${isLarge ? 'text-xl' : 'text-base'}`}>{f.title}</h3>
                  <p className={`text-muted-foreground leading-relaxed ${isLarge ? 'text-base' : 'text-sm'}`}>{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Key Benefits ─────────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-800 text-foreground mb-4">Built for real financial clarity</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">Every feature was designed around one question: does this help you understand your money better?</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {BENEFITS.map((b) => {
              const BIcon = b.icon;
              return (
                <div key={b.title} className="flex gap-4 p-5 rounded-2xl border border-border hover:border-accent/30 hover:bg-accent/3 transition-all">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <BIcon size={17} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-700 text-foreground mb-1">{b.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
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
            <h2 className="text-3xl sm:text-4xl font-800 text-foreground mb-4">Up and running in minutes</h2>
            <p className="text-muted-foreground">No bank connection required. Just add your accounts and start tracking.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.step} className="relative">
                <div className="card-elevated p-5 h-full">
                  <div className="text-3xl font-800 text-accent/20 mb-3">{step.step}</div>
                  <h3 className="text-sm font-700 text-foreground mb-2">{step.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
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
              <h2 className="text-3xl sm:text-4xl font-800 text-foreground mb-4">Works everywhere you do</h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">Smart Pocket is a Progressive Web App — install it on any device, use it in any browser, and access your data even when offline.</p>
              <div className="space-y-4">
                {[
                  { icon: Smartphone, label: 'Mobile (iOS & Android)', desc: 'Install from browser — no app store needed' },
                  { icon: Monitor, label: 'Desktop (Windows, macOS, Linux)', desc: 'Full-featured experience in any modern browser' },
                  { icon: Tablet, label: 'Tablet & iPad', desc: 'Responsive layout adapts to every screen size' },
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
                  <p className="font-700 text-foreground">PWA — Install as an App</p>
                  <p className="text-sm text-muted-foreground">Add to home screen from any browser. Works offline with background sync.</p>
                </div>
              </div>
              <div className="card-elevated p-5 flex flex-col items-center text-center gap-2">
                <Apple size={28} className="text-foreground" />
                <p className="text-sm font-600 text-foreground">Sign in with Apple</p>
                <p className="text-xs text-muted-foreground">Available</p>
              </div>
              <div className="card-elevated p-5 flex flex-col items-center text-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path d="M12 6a6 6 0 1 1 0 12A6 6 0 0 1 12 6z"/><path d="M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>
                <p className="text-sm font-600 text-foreground">Sign in with Google</p>
                <p className="text-xs text-muted-foreground">Available</p>
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
                { icon: Lock, title: 'Row-Level Security', desc: 'Database-enforced isolation. Your data is invisible to all other users.' },
                { icon: Shield, title: 'Encrypted in Transit', desc: 'All data travels over TLS 1.3. No plain-text transmission.' },
                { icon: Shield, title: 'Encrypted at Rest', desc: 'Data stored in Supabase is encrypted at the storage layer.' },
                { icon: CheckCircle2, title: 'No Data Selling', desc: 'We do not sell, share, or monetize your financial data. Ever.' },
              ].map((s) => {
                const SIcon = s.icon;
                return (
                  <div key={s.title} className="card-elevated p-5">
                    <div className="w-9 h-9 rounded-lg bg-positive/10 flex items-center justify-center mb-3">
                      <SIcon size={17} className="text-positive" />
                    </div>
                    <p className="text-sm font-700 text-foreground mb-1">{s.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>
                );
              })}
            </div>
            <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 text-xs font-700 uppercase tracking-widest text-positive bg-positive/10 px-3 py-1.5 rounded-full mb-6">
                <Shield size={12} /> Security & Privacy
              </div>
              <h2 className="text-3xl sm:text-4xl font-800 text-foreground mb-4">Your data stays yours</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">Smart Pocket uses Supabase with Row Level Security — a database-level policy that makes it technically impossible for one user to read another user's data, even if they know the table structure.</p>
              <Link href="/privacy" className="inline-flex items-center gap-2 text-sm font-600 text-accent hover:underline">
                Read our Privacy Policy <ArrowRight size={14} />
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
                <Languages size={12} /> Multilingual
              </div>
              <h2 className="text-3xl sm:text-4xl font-800 text-foreground mb-4">Built for a global audience</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">Smart Pocket supports four languages out of the box, including full right-to-left layout for Arabic. Switch languages instantly — the entire interface adapts.</p>
              <div className="flex flex-wrap gap-3">
                {LANGUAGES.map((l) => (
                  <div key={l.code} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card">
                    <span className="text-sm font-700 text-foreground">{l.name}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{l.dir}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card-elevated p-8 space-y-4">
              <p className="text-xs font-700 uppercase tracking-widest text-muted-foreground mb-4">Multi-currency support</p>
              {[
                { symbol: '$', code: 'USD', name: 'US Dollar' },
                { symbol: '€', code: 'EUR', name: 'Euro' },
                { symbol: 'د.إ', code: 'AED', name: 'UAE Dirham' },
                { symbol: '£', code: 'GBP', name: 'British Pound' },
              ].map((c) => (
                <div key={c.code} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-sm font-700 text-accent">{c.symbol}</span>
                    <span className="text-sm font-600 text-foreground">{c.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground font-600">{c.code}</span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-2">+ 150 more currencies supported</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Reports & Exports ────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-primary/4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-800 text-foreground mb-4">Professional reports, ready to share</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">Generate income/expense summaries, budget performance reports, and spending breakdowns for any date range.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { icon: FileText, title: 'PDF Statements', desc: 'Print-ready financial statements with your branding. Share with accountants or archive for records.' },
              { icon: Download, title: 'CSV Exports', desc: 'Export raw transaction data to CSV for spreadsheet analysis or accounting software import.' },
              { icon: BarChart3, title: 'Visual Charts', desc: 'Income vs expense trends, spending by category, and budget performance — all interactive.' },
            ].map((r) => {
              const RIcon = r.icon;
              return (
                <div key={r.title} className="card-elevated p-6">
                  <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                    <RIcon size={20} className="text-accent" />
                  </div>
                  <h3 className="text-base font-700 text-foreground mb-2">{r.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{r.desc}</p>
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
                  <Sparkles size={12} /> Coming Soon
                </div>
                <h2 className="text-2xl sm:text-3xl font-800 text-foreground mb-4">Smart insights are on the roadmap</h2>
                <p className="text-muted-foreground leading-relaxed">Smart Pocket is being built with AI-ready architecture. Future releases will include intelligent spending pattern analysis, anomaly detection, and personalized financial suggestions — all running on your own data, privately.</p>
              </div>
              <div className="space-y-3">
                {[
                  'Spending pattern analysis',
                  'Anomaly & unusual charge detection',
                  'Personalized saving suggestions',
                  'Predictive budget recommendations',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                    <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                      <Sparkles size={11} className="text-accent" />
                    </div>
                    <span className="text-sm text-muted-foreground">{item}</span>
                    <span className="ml-auto text-xs font-600 text-accent/60 bg-accent/10 px-2 py-0.5 rounded-full">Planned</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing Teaser ───────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-card/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-800 text-foreground mb-4">Simple, transparent pricing</h2>
            <p className="text-muted-foreground">Start free. Upgrade when you need more power.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div key={plan.id} className={`card-elevated p-6 relative flex flex-col ${plan.accent ? 'border-accent border-2' : ''}`}>
                {plan.accent && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-700 bg-accent text-accent-foreground px-3 py-1 rounded-full">Most Popular</span>
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
            All paid plans include a 14-day free trial. No credit card required to start.
          </p>
          <div className="text-center mt-4">
            <Link href="/pricing" className="inline-flex items-center gap-1.5 text-sm font-600 text-accent hover:underline">
              View full pricing details <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Contact CTA ──────────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 text-xs font-700 uppercase tracking-widest text-muted-foreground bg-muted px-3 py-1.5 rounded-full mb-6">
            <Mail size={12} /> Get in touch
          </div>
          <h2 className="text-3xl sm:text-4xl font-800 text-foreground mb-4">Have questions? We are here.</h2>
          <p className="text-muted-foreground mb-8 leading-relaxed">Whether you need help getting started, have a feature request, or want to discuss enterprise pricing — reach out and we will respond within 24 hours.</p>
          <Link href="/contact" className="btn-primary text-base py-3.5 px-10 mx-auto gap-2">
            <Mail size={18} /> Contact Us
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
          <h2 className="text-4xl sm:text-5xl font-800 text-foreground mb-4 tracking-tight">Start managing your money today</h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed">Join thousands of users who have taken control of their finances with Smart Pocket. Free to start, no credit card required.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sign-up-login" className="btn-primary text-base py-3.5 px-10 gap-2">
              Create Free Account <ArrowRight size={18} />
            </Link>
            <Link href="/about" className="btn-secondary text-base py-3.5 px-10">
              Learn More
            </Link>
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-8">
            {[1,2,3,4,5].map((s) => <Star key={s} size={14} className="text-amber-400 fill-amber-400" />)}
            <span className="text-sm text-muted-foreground ml-2">Loved by users worldwide</span>
          </div>
        </div>
      </section>

    </div>
  );
}
