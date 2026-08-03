'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  Monitor,
  RefreshCw,
  Bot,
  Receipt,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  isDesktopDownloadActive,
  type DesktopAppRelease,
  type DesktopPlatformRelease,
} from '@/lib/desktop-downloads';

type DesktopFeatureItem = {
  title: string;
  description: string;
};

const BENEFIT_ICONS = [Monitor, Bot, Receipt, ShieldCheck, RefreshCw, Sparkles];
const HOW_TO_ICONS = [Download, Workflow, ShieldCheck, Receipt, RefreshCw];
const PLATFORM_LOGO_ASSETS = {
  windows: '/assets/images/platform-logo-windows.svg',
  macos: '/assets/images/platform-logo-macos.svg',
} as const;

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => readString(item)).filter(Boolean);
}

function readFeatureItems(value: unknown): DesktopFeatureItem[] {
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

function readFeatureItem(value: unknown): DesktopFeatureItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const item = {
    title: readString((value as Record<string, unknown>).title),
    description: readString((value as Record<string, unknown>).description),
  };

  return item.title && item.description ? item : null;
}

function formatDisplayDate(value: string, locale: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(parsed);
}

function normalizeStatusLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function DesktopActionButton({
  href,
  label,
  disabled = false,
  className,
}: {
  href: string | null;
  label: string;
  disabled?: boolean;
  className: string;
}) {
  if (disabled || !href) {
    return (
      <span
        aria-disabled="true"
        className={`${className} cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 shadow-none`}
      >
        <Clock3 size={16} />
        {label}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      <Download size={16} />
      {label}
    </a>
  );
}

function DesktopDownloadCard({
  platform,
  language,
  t,
  appName,
  compact = false,
}: {
  platform: DesktopPlatformRelease;
  language: string;
  t: (key: string, options?: Record<string, unknown>) => unknown;
  appName: string;
  compact?: boolean;
}) {
  const isWindows = platform.platform === 'windows';
  const isActive = isDesktopDownloadActive(platform);
  const availabilityLabel = readString(
    t(
      isActive
        ? 'desktopAppPage.availability.available'
        : 'desktopAppPage.availability.comingSoon'
    )
  );
  const earlyAccessLabel = readString(
    t(
      isWindows
        ? 'desktopAppPage.availability.windowsEarlyAccess'
        : 'desktopAppPage.download.earlyAccessLabel'
    )
  );
  const actionLabel = isActive
    ? readString(
        t(
          isWindows
            ? 'desktopAppPage.download.windowsCta'
            : 'desktopAppPage.download.macosCta'
        )
      )
    : readString(t('desktopAppPage.availability.comingSoon'));
  const description = readString(
    t(
      isWindows
        ? 'desktopAppPage.download.windowsDescription'
        : 'desktopAppPage.download.macosDescription'
    )
  );
  const benefitItems = readStringArray(
    t(
      isWindows
        ? 'desktopAppPage.download.windowsBenefits'
        : 'desktopAppPage.download.macosBenefits',
      { returnObjects: true }
    )
  );
  const versionDateLine = readString(
    t('desktopAppPage.download.versionDateLabel', {
      version: platform.version,
      date: formatDisplayDate(platform.releaseDate, language),
      defaultValue: `Version ${platform.version} • Updated ${formatDisplayDate(platform.releaseDate, language)}`,
    })
  );
  const statusToneClass = isActive
    ? 'border-emerald-200/80 bg-emerald-50/90 text-emerald-800 shadow-[0_6px_14px_rgba(16,185,129,0.12)]'
    : 'border-slate-200 bg-slate-100/90 text-slate-700';
  const iconShellClass = isWindows
    ? 'from-sky-500 via-cyan-500 to-indigo-600 text-white shadow-[0_12px_26px_rgba(14,165,233,0.18)]'
    : 'from-slate-500 via-slate-600 to-slate-700 text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)]';
  const iconGlowClass = isWindows
    ? 'bg-[radial-gradient(circle,rgba(56,189,248,0.24),rgba(99,102,241,0.08),transparent_72%)]'
    : 'bg-[radial-gradient(circle,rgba(148,163,184,0.20),rgba(71,85,105,0.08),transparent_72%)]';
  const cardToneClass = isWindows
    ? 'border-sky-100/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,252,255,0.97))]'
    : 'border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(249,250,252,0.97))]';
  const logoAsset = isWindows ? PLATFORM_LOGO_ASSETS.windows : PLATFORM_LOGO_ASSETS.macos;
  const logoAlt = isWindows
    ? `${appName} Windows platform logo`
    : `${appName} macOS platform logo`;

  const normalizedStatusLabel = normalizeStatusLabel(readString(platform.statusLabel));
  let statusLabel = availabilityLabel;
  if (normalizedStatusLabel.includes('early access')) {
    statusLabel = earlyAccessLabel || readString(platform.statusLabel);
  } else if (
    normalizedStatusLabel === 'available' ||
    normalizedStatusLabel === 'available now'
  ) {
    statusLabel = availabilityLabel || readString(platform.statusLabel);
  } else if (normalizedStatusLabel === 'coming soon') {
    statusLabel = readString(t('desktopAppPage.availability.comingSoon'));
  } else if (readString(platform.statusLabel)) {
    statusLabel = readString(platform.statusLabel);
  }

  const isEarlyAccess = normalizeStatusLabel(statusLabel).includes(
    normalizeStatusLabel(
      readString(t('desktopAppPage.download.earlyAccessLabel'))
    )
  );

  const note = isWindows
    ? isEarlyAccess && platform.showSmartScreenNote
      ? readString(t('desktopAppPage.download.windowsSmartScreenNote'))
      : ''
    : isActive && isEarlyAccess
      ? readString(t('desktopAppPage.download.macosNotNotarizedNote'))
      : '';

  return (
    <article className={`relative flex flex-col overflow-hidden rounded-[2rem] border ${cardToneClass} shadow-[0_18px_36px_rgba(15,52,96,0.08)] ${compact ? 'p-5' : 'p-6 sm:p-[1.625rem]'}`}>
      <div className={`pointer-events-none absolute -top-12 ${isWindows ? '-left-8' : '-right-8'} h-40 w-40 rounded-full blur-3xl ${iconGlowClass}`} />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start gap-4">
          <div className="relative shrink-0 pt-1">
            <div className={`absolute inset-0 rounded-[1.5rem] blur-2xl ${iconGlowClass}`} />
            <div className={`relative inline-flex items-center justify-center rounded-[1.55rem] border border-white/45 bg-gradient-to-br ${iconShellClass} ${compact ? 'h-[4.15rem] w-[4.15rem]' : 'h-[4.85rem] w-[4.85rem]'} before:absolute before:inset-[1px] before:rounded-[1.45rem] before:bg-[linear-gradient(180deg,rgba(255,255,255,0.20),rgba(255,255,255,0.02))] before:content-['']`}>
              <span className="relative inline-flex items-center justify-center rounded-[1.15rem] bg-white/10 p-2.5 backdrop-blur-sm">
                <img
                  src={logoAsset}
                  alt={logoAlt}
                  className={`${compact ? 'h-8 w-8' : 'h-10 w-10'} object-contain`}
                />
              </span>
            </div>
          </div>
          <div className="min-w-0 flex flex-1 flex-col justify-center pt-1">
            <div className="flex min-h-[4.5rem] flex-col justify-center sm:min-h-[4.85rem]">
              <h2 className={`font-800 tracking-tight leading-tight text-foreground ${compact ? 'text-[1.35rem]' : 'text-[1.75rem]'}`}>
                {readString(
                  t(
                    isWindows
                      ? 'desktopAppPage.platformLabels.windows'
                      : 'desktopAppPage.platformLabels.macos'
                  ),
                  isWindows ? 'Windows' : 'macOS'
                )}
              </h2>
              <span className={`mt-2 inline-flex min-h-8 w-fit max-w-full items-center rounded-full border px-3 py-1 text-[10px] font-700 uppercase tracking-[0.08em] whitespace-nowrap sm:text-[10.5px] ${statusToneClass}`}>
                {statusLabel}
              </span>
            </div>
          </div>
        </div>

        <p className={`mt-5 max-w-none text-slate-600 ${compact ? 'text-[0.94rem] leading-6' : 'text-[0.98rem] leading-7'}`}>
          {description}
        </p>

        <p className="mt-2 text-[0.82rem] font-600 tracking-[0.03em] text-slate-500">{versionDateLine}</p>

        <div className="mt-5">
          <DesktopActionButton
            href={platform.directDownloadUrl}
            disabled={!isActive}
            label={actionLabel}
            className="btn-primary h-12 w-full justify-center rounded-2xl px-6 text-sm shadow-[0_14px_34px_rgba(13,148,136,0.22)] transition-shadow hover:shadow-[0_18px_40px_rgba(13,148,136,0.26)] focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2"
          />
        </div>

        {note ? (
          <p className="mt-3 flex items-start gap-2 text-[0.78rem] leading-6 text-slate-500">
            <AlertTriangle size={14} className="mt-1 shrink-0 text-amber-500" />
            {note}
          </p>
        ) : null}

        <div className="mt-5 border-t border-white/70 pt-5">
          <div className="space-y-3.5">
            {benefitItems.map((benefit) => (
              <div key={benefit} className="flex items-center gap-3 text-sm text-slate-700">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/15 bg-[linear-gradient(180deg,rgba(45,212,191,0.16),rgba(45,212,191,0.05))] text-accent shadow-[0_8px_18px_rgba(45,212,191,0.12)]">
                  <CheckCircle2 size={14} />
                </span>
                <span className="font-600 leading-6">{benefit}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function DesktopAppPageClient({
  desktopRelease,
  appName,
}: {
  desktopRelease: DesktopAppRelease;
  appName: string;
}) {
  const { t } = useTranslation('public');
  const { language, dir } = useLanguage();
  const trustBadges = readStringArray(
    t('desktopAppPage.hero.trustBadges', { returnObjects: true })
  );
  const benefits = readFeatureItems(
    t('desktopAppPage.benefits.items', { returnObjects: true })
  );
  const howToSteps = readFeatureItems(
    t('desktopAppPage.howToUse.steps', { returnObjects: true })
  );
  const fallbackReleaseNotes = desktopRelease.releaseNotes
    .map((note) => {
      const item = readFeatureItem(
        t(`desktopAppPage.updates.items.${note.id}`, { returnObjects: true })
      );
      if (!item) {
        return null;
      }

      return {
        ...item,
        toneLabel: readString(
          t(`desktopAppPage.updates.labels.${note.tone}`),
          note.tone
        ),
      };
    })
    .filter(Boolean) as Array<DesktopFeatureItem & { toneLabel: string }>;
  const latestUpdateNotes = desktopRelease.latestUpdate.notes.length > 0
    ? desktopRelease.latestUpdate.notes.map((note) => ({
        title: note,
        description: '',
        toneLabel: readString(
          t('desktopAppPage.updates.labels.new'),
          'New'
        ),
      }))
    : fallbackReleaseNotes;
  const latestUpdateTitle =
    desktopRelease.latestUpdate.title || readString(t('desktopAppPage.updates.title'));

  return (
    <div className="bg-background" dir={dir}>
      <section className="border-b border-border bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.10),transparent_34%),radial-gradient(circle_at_top_right,_rgba(99,102,241,0.08),transparent_26%),linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,1))]">
        <div className="page-shell py-10 sm:py-14 lg:py-16">
          <div className="space-y-8 lg:space-y-10">
            <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
              <article className="relative flex h-full flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.92))] p-6 shadow-[0_24px_60px_rgba(15,52,96,0.10)] backdrop-blur sm:p-7 md:col-span-2 xl:col-span-1">
                <div className="pointer-events-none absolute -top-14 -left-10 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.22),rgba(56,189,248,0.08),transparent_70%)] blur-3xl" />
                <div className="relative flex h-full flex-col">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-accent/15 bg-accent/10 px-4 py-2 text-xs font-700 uppercase tracking-[0.22em] text-accent">
                    <Monitor size={14} />
                    {readString(t('desktopAppPage.eyebrow'))}
                  </div>
                  <h1 className="mt-6 text-4xl font-800 tracking-tight text-foreground sm:text-[3.15rem] sm:leading-[1.02]">
                    {readString(t('desktopAppPage.hero.title'))}
                  </h1>
                  <p className="mt-4 text-base leading-8 text-muted-foreground sm:text-lg">
                    {readString(t('desktopAppPage.hero.description'))}
                  </p>

                  <div className="mt-6 space-y-2.5 border-t border-white/70 pt-4">
                    {trustBadges.map((badge) => (
                      <div
                        key={badge}
                        className="flex items-center gap-2.5 rounded-[1.15rem] border border-white/70 bg-white/75 px-3.5 py-2.5 text-sm font-600 text-slate-700 shadow-[0_8px_20px_rgba(15,52,96,0.05)]"
                      >
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/15 bg-[linear-gradient(180deg,rgba(45,212,191,0.16),rgba(45,212,191,0.05))] text-accent shadow-[0_7px_16px_rgba(45,212,191,0.10)]">
                          <CheckCircle2 size={14} />
                        </span>
                        <span className="leading-[1.35rem]">{badge}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>

              <DesktopDownloadCard
                platform={desktopRelease.platforms.windows}
                language={language}
                t={t}
                appName={appName}
              />
              <DesktopDownloadCard
                platform={desktopRelease.platforms.macos}
                language={language}
                t={t}
                appName={appName}
              />
            </div>

            <div className="relative overflow-hidden rounded-[2.35rem] border border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(241,245,249,0.88))] p-3 shadow-[0_28px_80px_rgba(15,52,96,0.14)] backdrop-blur sm:p-4">
              <div className="pointer-events-none absolute inset-x-10 top-8 h-40 rounded-full bg-accent/10 blur-3xl" />
              <div className="pointer-events-none absolute left-0 bottom-8 h-28 w-28 rounded-full bg-cyan-200/30 blur-3xl" />
              <div className="relative overflow-hidden rounded-[1.9rem] border border-slate-100 bg-slate-50">
                <img
                  src={desktopRelease.heroImageUrl}
                  alt={desktopRelease.heroImageAlt}
                  className="h-auto max-h-[34rem] w-full object-contain object-center"
                />
              </div>
              <div className="relative mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5">
                  <Monitor size={15} className="text-accent" />
                  {readString(
                    t('desktopAppPage.hero.showcaseLabel', {
                      appName,
                      defaultValue: `${appName} Desktop App`,
                    })
                  )}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5">
                  <RefreshCw size={15} className="text-accent" />
                  {formatDisplayDate(desktopRelease.latestUpdate.date, language)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="page-shell py-12 sm:py-14 lg:py-16">
        <div className="max-w-3xl">
          <p className="text-xs font-700 uppercase tracking-[0.2em] text-accent">
            {readString(t('desktopAppPage.benefits.eyebrow'))}
          </p>
          <h2 className="mt-3 text-3xl font-800 tracking-tight text-foreground sm:text-4xl">
            {readString(t('desktopAppPage.benefits.title'))}
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            {readString(t('desktopAppPage.benefits.description'))}
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {benefits.map((item, index) => {
            const Icon = BENEFIT_ICONS[index % BENEFIT_ICONS.length];
            return (
              <article key={item.title} className="card-elevated h-full p-5 sm:p-6">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <Icon size={20} />
                </div>
                <h3 className="mt-4 text-lg font-800 tracking-tight text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-border bg-card/35">
        <div className="page-shell py-12 sm:py-14 lg:py-16">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="card-elevated p-6 sm:p-7">
              <p className="text-xs font-700 uppercase tracking-[0.2em] text-accent">
                {readString(t('desktopAppPage.updates.eyebrow'))}
              </p>
              <h2 className="mt-3 text-3xl font-800 tracking-tight text-foreground sm:text-4xl">
                {latestUpdateTitle}
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                {readString(t('desktopAppPage.updates.description'))}
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border bg-background px-4 py-3">
                  <p className="text-[11px] font-700 uppercase tracking-[0.16em] text-muted-foreground">
                    {readString(t('desktopAppPage.download.versionLabel'))}
                  </p>
                  <p className="mt-2 text-sm font-700 text-foreground">{desktopRelease.platforms.windows.version}</p>
                </div>
                <div className="rounded-2xl border border-border bg-background px-4 py-3">
                  <p className="text-[11px] font-700 uppercase tracking-[0.16em] text-muted-foreground">
                    {readString(t('desktopAppPage.download.releaseDateLabel'))}
                  </p>
                  <p className="mt-2 text-sm font-700 text-foreground">{formatDisplayDate(desktopRelease.latestUpdate.date, language)}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {latestUpdateNotes.map((item) => (
                <article key={`${item.toneLabel}-${item.title}`} className="card-elevated p-5 sm:p-6">
                  <div className="flex items-start gap-4">
                    <div className="mt-1 inline-flex rounded-full bg-accent/10 px-3 py-1 text-xs font-700 uppercase tracking-[0.16em] text-accent">
                      {item.toneLabel}
                    </div>
                    <div>
                      <h3 className="text-base font-800 tracking-tight text-foreground">{item.title}</h3>
                      {item.description ? (
                        <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.description}</p>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="page-shell py-12 sm:py-14 lg:py-16">
        <div className="max-w-3xl">
          <p className="text-xs font-700 uppercase tracking-[0.2em] text-accent">
            {readString(t('desktopAppPage.howToUse.eyebrow'))}
          </p>
          <h2 className="mt-3 text-3xl font-800 tracking-tight text-foreground sm:text-4xl">
            {readString(t('desktopAppPage.howToUse.title'))}
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            {readString(t('desktopAppPage.howToUse.description'))}
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {howToSteps.map((step, index) => {
            const Icon = HOW_TO_ICONS[index % HOW_TO_ICONS.length];

            return (
              <article key={step.title} className="card-elevated h-full p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 min-w-[2.5rem] items-center justify-center rounded-full bg-accent text-sm font-800 text-accent-foreground">
                    {(index + 1).toString()}
                  </span>
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <Icon size={18} />
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-800 tracking-tight text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{step.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="page-shell py-12 sm:py-14 lg:py-16">
        <div className="overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,rgba(14,116,144,1),rgba(15,23,42,0.96))] px-6 py-8 text-white shadow-[0_24px_70px_rgba(15,52,96,0.22)] sm:px-8 lg:px-10">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:items-center">
            <div>
              <p className="text-xs font-700 uppercase tracking-[0.2em] text-cyan-100">
                {readString(t('desktopAppPage.finalCta.eyebrow'))}
              </p>
              <h2 className="mt-3 text-3xl font-800 tracking-tight sm:text-4xl">
                {readString(t('desktopAppPage.finalCta.title'))}
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-100">
                {readString(t('desktopAppPage.finalCta.description'))}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <DesktopDownloadCard
                platform={desktopRelease.platforms.windows}
                language={language}
                t={t}
                appName={appName}
                compact
              />
              <DesktopDownloadCard
                platform={desktopRelease.platforms.macos}
                language={language}
                t={t}
                appName={appName}
                compact
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
