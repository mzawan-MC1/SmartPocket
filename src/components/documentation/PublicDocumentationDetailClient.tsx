'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowUpDown,
  BookOpen,
  Building2,
  Calculator,
  CalendarClock,
  ChevronRight,
  CreditCard,
  HandCoins,
  LifeBuoy,
  PiggyBank,
  PieChart,
  Rocket,
  ShieldCheck,
  Sliders,
  Sparkles,
  Target,
  Users,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import Badge from '@/components/ui/Badge';
import CmsHtml from '@/components/cms/CmsHtml';
import {
  documentationContentDir,
  isDocumentationContentRtl,
  normalizeDocumentationLanguage,
  type DocumentationCategoryRecord,
  type DocumentationLanguageCode,
  type PublicDocumentationArticle,
} from '@/lib/documentation';
import type { SupportedLanguage } from '@/i18n/resources';

type DocumentationCategoryTint = {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  badgeBg: string;
  badgeText: string;
  ring: string;
};

const CATEGORY_TINT: Record<string, DocumentationCategoryTint> = {
  'getting-started': {
    icon: Rocket,
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-600',
    ring: 'ring-emerald-500/15',
  },
  'ai-smart-entry': {
    icon: Sparkles,
    badgeBg: 'bg-fuchsia-50',
    badgeText: 'text-fuchsia-600',
    ring: 'ring-fuchsia-500/15',
  },
  'accounts-wallets': {
    icon: Wallet,
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-600',
    ring: 'ring-amber-500/15',
  },
  'budgets': {
    icon: PieChart,
    badgeBg: 'bg-teal-50',
    badgeText: 'text-teal-600',
    ring: 'ring-teal-500/15',
  },
  'transactions': {
    icon: ArrowUpDown,
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-600',
    ring: 'ring-blue-500/15',
  },
  'subscriptions-payments': {
    icon: CreditCard,
    badgeBg: 'bg-violet-50',
    badgeText: 'text-violet-600',
    ring: 'ring-violet-500/15',
  },
  'spaces-shared': {
    icon: Users,
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-600',
    ring: 'ring-indigo-500/15',
  },
  'savings-tools': {
    icon: PiggyBank,
    badgeBg: 'bg-cyan-50',
    badgeText: 'text-cyan-600',
    ring: 'ring-cyan-500/15',
  },
  'general': {
    icon: ShieldCheck,
    badgeBg: 'bg-sky-50',
    badgeText: 'text-sky-600',
    ring: 'ring-sky-500/15',
  },
};

const CATEGORY_KEYWORD_HINTS: Array<{ keywords: string[]; key: string }> = [
  { keywords: ['getting', 'start', 'welcome', 'setup', 'onboard', 'quick'], key: 'getting-started' },
  { keywords: ['ai', 'smart', 'receipt', 'ocr', 'bot', 'spark', 'parse', 'voice', 'transcribe'], key: 'ai-smart-entry' },
  { keywords: ['account', 'wallet', 'bank', 'card', 'building'], key: 'accounts-wallets' },
  { keywords: ['budget', 'target', 'pie', 'limit', 'spending', 'plan'], key: 'budgets' },
  { keywords: ['transaction', 'cash', 'flow', 'expense', 'income', 'transfer', 'money in', 'money out'], key: 'transactions' },
  { keywords: ['subscription', 'payment', 'billing', 'plan', 'invoice', 'recurring'], key: 'subscriptions-payments' },
  { keywords: ['space', 'shared', 'team', 'family', 'users', 'group', 'coins'], key: 'spaces-shared' },
  { keywords: ['saving', 'goal', 'piggy', 'invest', 'tool', 'calculator', 'exchange', 'rate'], key: 'savings-tools' },
];

function resolveCategoryVisual(category?: string): DocumentationCategoryTint {
  const normalized = (category || 'general').trim().toLowerCase();
  if (CATEGORY_TINT[normalized]) {
    return CATEGORY_TINT[normalized];
  }
  for (const hint of CATEGORY_KEYWORD_HINTS) {
    if (hint.keywords.some((word) => normalized.includes(word))) {
      return CATEGORY_TINT[hint.key];
    }
  }
  return CATEGORY_TINT.general;
}

export default function PublicDocumentationDetailClient({
  dataByLanguage,
  relatedByLanguage,
  activeCategories,
}: {
  dataByLanguage: Record<
    SupportedLanguage,
    {
      article: PublicDocumentationArticle | null;
      effectiveLocale: DocumentationLanguageCode;
    }
  >;
  relatedByLanguage?: Record<
    SupportedLanguage,
    { articles: PublicDocumentationArticle[] }
  >;
  activeCategories?: DocumentationCategoryRecord[];
}) {
  const { t } = useTranslation('portal');
  const router = useRouter();
  const { language, dir } = useLanguage();

  const activeLanguage = normalizeDocumentationLanguage(language);
  const resolvedData = dataByLanguage[activeLanguage] || dataByLanguage.en;
  const article = resolvedData.article;

  const contentLocale = resolvedData.effectiveLocale;
  const contentDir = documentationContentDir(contentLocale);
  const contentIsRtl = isDocumentationContentRtl(contentLocale);

  const relatedArticles = relatedByLanguage
    ? (relatedByLanguage[activeLanguage] || relatedByLanguage.en || { articles: [] }).articles
    : [];

  if (!article) {
    return null;
  }

  const categoryNameMap = React.useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const cat of activeCategories || []) {
      if (cat && cat.slug && cat.is_active !== false && cat.name) {
        map[cat.slug] = cat.name;
      }
    }
    return map;
  }, [activeCategories]);

  const displayCategoryLabel = (category: string) => {
    const match = (activeCategories || []).find(
      (c) => c && typeof c.slug === 'string' && c.slug === category
    );
    if (match) {
      const translations = match.translations && typeof match.translations === 'object'
        ? match.translations
        : undefined;
      const curEntry = translations?.[language as SupportedLanguage];
      if (curEntry && typeof curEntry.name === 'string' && curEntry.name.trim().length > 0) {
        return curEntry.name;
      }
      const enEntry = translations?.en;
      if (enEntry && typeof enEntry.name === 'string' && enEntry.name.trim().length > 0 && String(language).toLowerCase() !== 'en') {
        return enEntry.name;
      }
      if (typeof match.name === 'string' && match.name.trim().length > 0) {
        return match.name;
      }
    }
    const key = `documentation.categories.${category.replace(/-/g, '')}`;
    const val = t(key, { ns: 'portal', defaultValue: '' });
    return val || category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, ' ');
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const heroVisual = resolveCategoryVisual(article.category);
  const HeroIcon = heroVisual.icon;

  return (
    <div className="space-y-6" dir={dir}>
      <nav className="flex items-center gap-2">
        <Link
          href="/help/documentation"
          className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-700 text-muted-foreground transition-colors hover:border-accent hover:text-accent"
        >
          <ArrowLeft size={14} />
          {t('documentation.backToList', { ns: 'portal', defaultValue: 'Back to Documentation' })}
        </Link>
      </nav>

      <article dir={contentDir} className="mx-auto max-w-4xl overflow-hidden rounded-[28px] border border-border/85 bg-gradient-to-b from-white to-slate-50/60 shadow-card-sm">
        <header className="border-b border-border/70 px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {article.category ? (
                  <Badge variant="active">{displayCategoryLabel(article.category)}</Badge>
                ) : null}
                {article.updatedAt ? (
                  <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11px] font-700 uppercase tracking-[0.12em] text-muted-foreground">
                    {t('documentation.updated', { ns: 'portal', defaultValue: 'Updated' })} {formatDate(article.updatedAt)}
                  </span>
                ) : null}
              </div>
              <h1 className={`mt-4 text-2xl font-800 text-foreground sm:text-3xl ${contentIsRtl ? 'text-right' : 'text-left'}`}>
                {article.title}
              </h1>
              <p className={`mt-3 text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7 ${contentIsRtl ? 'text-right' : 'text-left'}`}>
                {article.summary}
              </p>
            </div>
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 sm:h-14 sm:w-14 ${heroVisual.badgeBg} ${heroVisual.badgeText} ${heroVisual.ring}`}>
              <HeroIcon size={22} />
            </div>
          </div>
        </header>

        <div dir={contentDir} className={`px-5 py-7 sm:px-8 sm:py-10 ${contentIsRtl ? 'text-right' : 'text-left'}`}>
          <div className="mx-auto max-w-3xl">
            <CmsHtml
              html={article.contentHtml}
              className={`prose prose-slate max-w-none text-[0.95rem] leading-[1.75] text-muted-foreground
                [&_a]:text-accent [&_a]:no-underline hover:[&_a]:underline
                [&_h1]:text-foreground [&_h1]:text-2xl [&_h1]:font-800 [&_h1]:mt-6 [&_h1]:mb-3
                [&_h2]:text-foreground [&_h2]:text-xl [&_h2]:font-800 [&_h2]:mt-6 [&_h2]:mb-3
                [&_h3]:text-foreground [&_h3]:text-lg [&_h3]:font-800 [&_h3]:mt-5 [&_h3]:mb-2
                [&_h4]:text-foreground [&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:font-700
                [&_ol]:!list-decimal [&_ol]:my-4 [&_ol]:space-y-1 [&_ol_li]:ps-2 [&_ol]:ps-6
                [&_ul]:!list-disc [&_ul]:my-4 [&_ul]:space-y-1 [&_ul_li]:ps-2 [&_ul]:ps-6
                [&_ol_ol]:mt-2 [&_ol_ul]:mt-2 [&_ul_ul]:mt-2 [&_ul_ol]:mt-2
                [&_ol_ol]:!list-[lower-alpha] [&_ul_ul]:!list-circle
                [&_li]:leading-7
                [&_p]:text-foreground/85 [&_p]:my-4
                [&_blockquote]:border-s-4 [&_blockquote]:border-accent/40 [&_blockquote]:bg-accent/5 [&_blockquote]:ps-4 [&_blockquote]:py-2 [&_blockquote]:text-foreground/80 [&_blockquote]:my-5 [&_blockquote]:rounded-e-lg
                [&_strong]:text-foreground [&_strong]:font-800
                [&_u]:underline [&_u]:decoration-accent/40 [&_u]:decoration-2 [&_u]:underline-offset-4
                [&_em]:italic
                [&_code]:rounded-md [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-slate-900 dark:[&_code]:text-slate-100 [&_code]:ring-1 [&_code]:ring-slate-200
                [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/30 [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-xs
                [&_pre_code]:!bg-transparent [&_pre_code]:!p-0 [&_pre_code]:!ring-0 [&_pre_code]:!text-slate-900 dark:[&_pre_code]:!text-slate-100
                [&_hr]:my-6 [&_hr]:border-border
                [&_img]:w-full [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-2xl [&_img]:border [&_img]:border-border/70 [&_img]:shadow-sm [&_img]:my-5 [&_img]:mx-auto
                [&_figure]:my-6 [&_figure]:flex [&_figure]:flex-col [&_figure]:items-center [&_figure_img]:my-2 [&_figure_img]:w-full [&_figure_img]:rounded-2xl [&_figure_img]:border [&_figure_img]:border-border/70 [&_figure_img]:shadow-sm
                [&_figcaption]:mt-2 [&_figcaption]:text-xs [&_figcaption]:text-center [&_figcaption]:text-muted-foreground
                ${contentIsRtl ? 'text-right' : 'text-left'}`}
            />
          </div>
        </div>
      </article>

      {Array.isArray(relatedArticles) && relatedArticles.length > 0 ? (
        <section dir={dir} className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-800 text-foreground">
                {t('documentation.relatedTitle', { ns: 'portal', defaultValue: 'Continue learning' })}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('documentation.relatedDescription', { ns: 'portal', defaultValue: 'Related guides from the same category and other documentation.' })}
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {relatedArticles.slice(0, 4).map((relatedArticle) => {
              const cardDir = documentationContentDir(relatedArticle.localeCode);
              const cardIsRtl = isDocumentationContentRtl(relatedArticle.localeCode);
              const visual = resolveCategoryVisual(relatedArticle.category);
              const Icon = visual.icon;
              return (
                <Link
                  key={relatedArticle.id}
                  href={`/help/documentation/${relatedArticle.slug}`}
                  dir={cardDir}
                  className={`group relative flex h-full flex-col overflow-hidden rounded-[22px] border border-border/80 bg-gradient-to-b from-white to-slate-50/60 p-5 shadow-card-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-card-md ${cardIsRtl ? 'text-right' : 'text-left'}`}
                >
                  <div className={`mb-2 inline-flex items-center gap-2 text-[11px] font-700 uppercase tracking-[0.12em] ${cardIsRtl ? 'mr-auto' : 'ml-auto'}`}>
                    {relatedArticle.category ? (
                      <span className={`inline-flex items-center rounded-full ring-1 ${visual.badgeBg} ${visual.badgeText} ${visual.ring} px-2 py-0.5 tracking-normal`}>
                        {displayCategoryLabel(relatedArticle.category)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mb-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                    <Icon size={18} />
                  </div>
                  <h3 className={`text-base font-800 text-foreground transition-colors duration-200 group-hover:text-accent ${cardIsRtl ? 'text-right' : 'text-left'}`}>
                    {relatedArticle.title}
                  </h3>
                  <p className={`mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground ${cardIsRtl ? 'text-right' : 'text-left'}`}>
                    {relatedArticle.summary}
                  </p>
                  <div className={`mt-5 inline-flex w-full items-center justify-between text-sm font-700 text-accent`}>
                    <span>{t('documentation.readGuide', { ns: 'portal', defaultValue: 'Read guide' })}</span>
                    <ChevronRight size={15} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-border bg-card px-5 py-6 shadow-card-sm sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-700 text-foreground">
              {t('documentation.supportCtaTitle', { ns: 'portal', defaultValue: "Still need help?" })}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t('documentation.supportCtaDescription', { ns: 'portal', defaultValue: "If this guide didn't answer your question, open a support ticket and our team will help you." })}
            </p>
          </div>
          <Link href="/support/new" className="btn-primary inline-flex min-h-11 items-center justify-center gap-2">
            <LifeBuoy size={16} />
            {t('documentation.createTicketAction', { ns: 'portal', defaultValue: 'Create support ticket' })}
          </Link>
        </div>
      </section>
    </div>
  );
}
