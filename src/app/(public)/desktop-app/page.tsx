import type { Metadata } from 'next';
import {
  AlertTriangle,
  Apple,
  Bot,
  CheckCircle2,
  Clock3,
  Download,
  Monitor,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { BASE_I18N_RESOURCES } from '@/i18n/resources';
import {
  DESKTOP_APP_ROUTE,
  resolveDesktopAppRelease,
  isDesktopDownloadActive,
  type DesktopDownloadPlatform,
  type DesktopPlatformRelease,
  type DesktopReleaseNoteTone,
} from '@/lib/desktop-downloads';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { buildPageMetadata, resolveMetadataLanguage } from '@/lib/site-metadata';

type DesktopFeatureItem = {
  title: string;
  description: string;
};

type DesktopPageText = {
  seoTitle?: string;
  seoDescription?: string;
  ogTitle?: string;
  ogDescription?: string;
  eyebrow?: string;
  hero?: {
    title?: string;
    description?: string;
    windowsCta?: string;
    macosCta?: string;
    trustBadges?: unknown;
  };
  platformLabels?: {
    windows?: string;
    macos?: string;
  };
  availability?: {
    available?: string;
    windowsEarlyAccess?: string;
    comingSoon?: string;
  };
  warnings?: {
    windowsSmartScreen?: string;
    macosPreparing?: string;
    officialInstallers?: string;
  };
  benefits?: {
    eyebrow?: string;
    title?: string;
    description?: string;
    items?: unknown;
  };
  download?: {
    eyebrow?: string;
    title?: string;
    description?: string;
    versionLabel?: string;
    releaseDateLabel?: string;
    windowsDescription?: string;
    macosDescription?: string;
    windowsCta?: string;
    macosCta?: string;
    earlyAccessLabel?: string;
    versionDateLabel?: string;
    windowsBenefits?: unknown;
    macosBenefits?: unknown;
    windowsSmartScreenNote?: string;
    macosNotNotarizedNote?: string;
  };
  updates?: {
    eyebrow?: string;
    title?: string;
    description?: string;
    cta?: string;
    labels?: {
      new?: string;
      improved?: string;
      fix?: string;
    };
    items?: Record<string, unknown>;
  };
  howToUse?: {
    eyebrow?: string;
    title?: string;
    description?: string;
    steps?: unknown;
  };
  finalCta?: {
    eyebrow?: string;
    title?: string;
    description?: string;
  };
};

const BENEFIT_ICONS = [Monitor, Bot, Receipt, ShieldCheck, RefreshCw, Sparkles];
const HOW_TO_ICONS = [Download, Workflow, ShieldCheck, Receipt, RefreshCw];

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

function getDesktopAppText(language: keyof typeof BASE_I18N_RESOURCES) {
  const publicText = BASE_I18N_RESOURCES[language].public as Record<string, unknown>;
  const englishText = BASE_I18N_RESOURCES.en.public as Record<string, unknown>;
  const localized = publicText.desktopAppPage;
  const english = englishText.desktopAppPage;

  if (localized && typeof localized === 'object') {
    return localized as DesktopPageText;
  }

  if (english && typeof english === 'object') {
    return english as DesktopPageText;
  }

  return {};
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

function getReleaseToneLabel(tone: DesktopReleaseNoteTone, text: DesktopPageText) {
  switch (tone) {
    case 'new':
      return readString(text.updates?.labels?.new, 'New');
    case 'improved':
      return readString(text.updates?.labels?.improved, 'Improved');
    default:
      return readString(text.updates?.labels?.fix, 'Fix');
  }
}

function getPlatformLabel(platform: DesktopDownloadPlatform, text: DesktopPageText) {
  return platform === 'windows'
    ? readString(text.platformLabels?.windows, 'Windows')
    : readString(text.platformLabels?.macos, 'macOS');
}

function getPlatformAvailability(platform: DesktopPlatformRelease, text: DesktopPageText) {
  if (isDesktopDownloadActive(platform)) {
    return readString(text.availability?.available, 'Available now');
  }

  return readString(text.availability?.comingSoon, 'Coming soon');
}

function getPlatformStatusLabel(platform: DesktopPlatformRelease, text: DesktopPageText) {
  if (platform.statusLabel) {
    return platform.statusLabel;
  }

  if (isDesktopDownloadActive(platform)) {
    return getPlatformAvailability(platform, text);
  }

  return readString(text.availability?.comingSoon, 'Coming soon');
}

function isEarlyAccessStatus(platform: DesktopPlatformRelease, text: DesktopPageText) {
  const status = getPlatformStatusLabel(platform, text).trim().toLowerCase();
  const earlyAccessLabels = [
    readString(text.download?.earlyAccessLabel, 'Early Access'),
    'Early Access',
  ]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return earlyAccessLabels.includes(status);
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
  text,
  locale,
  compact = false,
}: {
  platform: DesktopPlatformRelease;
  text: DesktopPageText;
  locale: string;
  compact?: boolean;
}) {
  const isWindows = platform.platform === 'windows';
  const Icon = isWindows ? Monitor : Apple;
  const isActive = isDesktopDownloadActive(platform);
  const isEarlyAccess = isActive && isEarlyAccessStatus(platform, text);
  const actionLabel = isActive
    ? isWindows
      ? readString(text.download?.windowsCta, 'Download for Windows')
      : readString(text.download?.macosCta, 'Download for macOS')
    : readString(text.availability?.comingSoon, 'Coming soon');
  const description = isWindows
    ? readString(
        text.download?.windowsDescription,
        'Install Smart Pocket on Windows for a cleaner, faster desktop experience.'
      )
    : readString(
        text.download?.macosDescription,
        'Use Smart Pocket on macOS with a polished desktop workspace built for everyday finance.'
      );
  const benefitItems = readStringArray(
    isWindows ? text.download?.windowsBenefits : text.download?.macosBenefits
  );
  const versionDateLine = readString(
    text.download?.versionDateLabel,
    'Version {{version}} • Updated {{date}}'
  )
    .replace('{{version}}', platform.version)
    .replace('{{date}}', formatDisplayDate(platform.releaseDate, locale));
  const note = isWindows
    ? isEarlyAccess && platform.showSmartScreenNote
      ? readString(
          text.download?.windowsSmartScreenNote,
          'Windows may show a SmartScreen warning while this early-access build is being verified.'
        )
      : ''
    : isActive && isEarlyAccess
      ? readString(
          text.download?.macosNotNotarizedNote,
          'This early-access build is not yet Apple-notarized.'
        )
      : '';

  return (
    <article className={`flex h-full flex-col rounded-[1.9rem] border border-slate-200/90 bg-white/95 shadow-[0_24px_60px_rgba(15,52,96,0.10)] ${compact ? 'p-5' : 'p-6 sm:p-7'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={`inline-flex items-center justify-center rounded-[1.35rem] ${isWindows ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-700'} ${compact ? 'h-14 w-14' : 'h-16 w-16'}`}>
            <Icon size={compact ? 28 : 32} />
          </div>
          <h2 className={`mt-4 font-800 tracking-tight text-foreground ${compact ? 'text-xl' : 'text-2xl'}`}>
            {getPlatformLabel(platform.platform, text)}
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-700 uppercase tracking-[0.16em] ${isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
          {isActive ? getPlatformStatusLabel(platform, text) : getPlatformAvailability(platform, text)}
        </span>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{versionDateLine}</p>

      <div className="mt-6">
        <DesktopActionButton
          href={platform.directDownloadUrl}
          disabled={!isActive}
          label={actionLabel}
          className="btn-primary h-12 w-full justify-center px-6 text-sm"
        />
      </div>

      {note ? (
        <p className="mt-3 flex items-start gap-2 text-xs leading-6 text-muted-foreground">
          <AlertTriangle size={14} className="mt-1 shrink-0 text-amber-500" />
          {note}
        </p>
      ) : null}

      <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
        {benefitItems.map((benefit) => (
          <div key={benefit} className="flex items-center gap-3 text-sm text-slate-700">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
              <CheckCircle2 size={14} />
            </span>
            <span className="font-600 leading-6">{benefit}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);
  const desktopText = getDesktopAppText(language);
  const desktopRelease = resolveDesktopAppRelease(settings);

  return buildPageMetadata({
    settings,
    language,
    pathname: DESKTOP_APP_ROUTE,
    canonicalPath: DESKTOP_APP_ROUTE,
    title: readString(desktopText.seoTitle, 'Smart Pocket Desktop App for Windows and macOS'),
    description: readString(
      desktopText.seoDescription,
      'Download Smart Pocket for Windows and manage expenses, budgets, subscriptions, receipts and everyday finances from your desktop. The macOS version is coming soon.'
    ),
    openGraphTitle: readString(desktopText.ogTitle, readString(desktopText.seoTitle)),
    openGraphDescription: readString(desktopText.ogDescription, readString(desktopText.seoDescription)),
    socialImageUrl: desktopRelease.heroImageUrl,
    twitterImageUrl: desktopRelease.heroImageUrl,
  });
}

export default async function DesktopAppPage() {
  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);
  const desktopText = getDesktopAppText(language);
  const desktopRelease = resolveDesktopAppRelease(settings);
  const trustBadges = readStringArray(desktopText.hero?.trustBadges);
  const benefits = readFeatureItems(desktopText.benefits?.items);
  const howToSteps = readFeatureItems(desktopText.howToUse?.steps);
  const appName = settings.branding.appName;

  const fallbackReleaseNotes = desktopRelease.releaseNotes
    .map((note) => {
      const item = readFeatureItem(desktopText.updates?.items?.[note.id]);
      if (!item) {
        return null;
      }

      return {
        ...item,
        toneLabel: getReleaseToneLabel(note.tone, desktopText),
      };
    })
    .filter(Boolean) as Array<DesktopFeatureItem & { toneLabel: string }>;

  const latestUpdateNotes = desktopRelease.latestUpdate.notes.length > 0
    ? desktopRelease.latestUpdate.notes.map((note) => ({
        title: note,
        description: '',
        toneLabel: readString(desktopText.updates?.labels?.new, 'New'),
      }))
    : fallbackReleaseNotes;

  const latestUpdateTitle = desktopRelease.latestUpdate.title
    || readString(desktopText.updates?.title, "What's new and updates");

  return (
    <div className="bg-background">
      <section className="border-b border-border bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.10),transparent_34%),radial-gradient(circle_at_top_right,_rgba(99,102,241,0.08),transparent_26%),linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,1))]">
        <div className="page-shell py-10 sm:py-14 lg:py-16">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.88fr)] xl:items-center">
            <div className="max-w-3xl xl:pr-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/15 bg-accent/10 px-4 py-2 text-xs font-700 uppercase tracking-[0.22em] text-accent">
                <Monitor size={14} />
                {readString(desktopText.eyebrow, 'Desktop App')}
              </div>
              <h1 className="mt-6 text-4xl font-800 tracking-tight text-foreground sm:text-5xl">
                {readString(desktopText.hero?.title, 'Smart Pocket for Desktop')}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
                {readString(
                  desktopText.hero?.description,
                  'Download Smart Pocket for Windows and manage expenses, budgets, subscriptions, receipts, and everyday finances from your desktop. The macOS version is coming soon.'
                )}
              </p>

              <div className="mt-6 flex flex-wrap gap-2.5">
                {trustBadges.map((badge) => (
                  <span
                    key={badge}
                    className="inline-flex items-center gap-2 rounded-full border border-accent/12 bg-white/90 px-3.5 py-2 text-sm font-600 text-slate-700 shadow-sm"
                  >
                    <CheckCircle2 size={15} className="text-accent" />
                    {badge}
                  </span>
                ))}
              </div>

              <div className="mt-8 grid gap-4 lg:grid-cols-2">
                <DesktopDownloadCard platform={desktopRelease.platforms.windows} text={desktopText} locale={language} />
                <DesktopDownloadCard platform={desktopRelease.platforms.macos} text={desktopText} locale={language} />
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[38rem] xl:max-w-[40rem]">
              <div className="absolute inset-x-12 top-12 h-36 rounded-full bg-accent/10 blur-3xl" />
              <div className="relative overflow-hidden rounded-[2rem] border border-border/80 bg-white/92 p-3 shadow-[0_24px_70px_rgba(15,52,96,0.12)] backdrop-blur">
                <img
                  src={desktopRelease.heroImageUrl}
                  alt={desktopRelease.heroImageAlt}
                  className="h-auto max-h-[34rem] w-full rounded-[1.5rem] border border-slate-100 bg-slate-50 object-contain"
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5">
                  <Monitor size={15} className="text-accent" />
                  {appName} Desktop
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
            {readString(desktopText.benefits?.eyebrow, 'Why use it')}
          </p>
          <h2 className="mt-3 text-3xl font-800 tracking-tight text-foreground sm:text-4xl">
            {readString(desktopText.benefits?.title, 'Powerful features. Better money management.')}
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            {readString(
              desktopText.benefits?.description,
              'Smart Pocket Desktop keeps the experience compact, readable, and practical while giving you more room to focus on your finances.'
            )}
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
                {readString(desktopText.updates?.eyebrow, "What's new")}
              </p>
              <h2 className="mt-3 text-3xl font-800 tracking-tight text-foreground sm:text-4xl">
                {latestUpdateTitle}
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                {readString(
                  desktopText.updates?.description,
                  'The current desktop release keeps improving sign-in, installer delivery, and everyday stability.'
                )}
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border bg-background px-4 py-3">
                  <p className="text-[11px] font-700 uppercase tracking-[0.16em] text-muted-foreground">
                    {readString(desktopText.download?.versionLabel, 'Current version')}
                  </p>
                  <p className="mt-2 text-sm font-700 text-foreground">{desktopRelease.platforms.windows.version}</p>
                </div>
                <div className="rounded-2xl border border-border bg-background px-4 py-3">
                  <p className="text-[11px] font-700 uppercase tracking-[0.16em] text-muted-foreground">
                    {readString(desktopText.download?.releaseDateLabel, 'Release date')}
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
            {readString(desktopText.howToUse?.eyebrow, 'How to use')}
          </p>
          <h2 className="mt-3 text-3xl font-800 tracking-tight text-foreground sm:text-4xl">
            {readString(desktopText.howToUse?.title, 'How to use Smart Pocket Desktop')}
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            {readString(
              desktopText.howToUse?.description,
              'Get started in a few simple steps and keep your finances close at hand on desktop.'
            )}
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
                {readString(desktopText.finalCta?.eyebrow, 'Ready to download?')}
              </p>
              <h2 className="mt-3 text-3xl font-800 tracking-tight sm:text-4xl">
                {readString(desktopText.finalCta?.title, 'Ready to take control of your finances?')}
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-100">
                {readString(
                  desktopText.finalCta?.description,
                  'Download Smart Pocket for Windows today. The macOS version is coming soon.'
                )}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <DesktopDownloadCard platform={desktopRelease.platforms.windows} text={desktopText} locale={language} compact />
              <DesktopDownloadCard platform={desktopRelease.platforms.macos} text={desktopText} locale={language} compact />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
