'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowLeftRight,
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
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Target,
  Users,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import PageHeader from '@/components/ui/PageHeader';
import SearchField from '@/components/ui/SearchField';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
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

export default function PublicDocumentationClient({
  dataByLanguage,
  activeCategories,
  supportHref,
}: {
  dataByLanguage: Record<
    SupportedLanguage,
    { articles: PublicDocumentationArticle[]; effectiveLocale: DocumentationLanguageCode }
  >;
  activeCategories?: DocumentationCategoryRecord[];
  supportHref: string;
}) {
  const { t } = useTranslation('portal');
  const router = useRouter();
  const { language, dir } = useLanguage();
  const [query, setQuery] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('all');

  const activeLanguage = normalizeDocumentationLanguage(language);
  const resolvedData = dataByLanguage[activeLanguage] || dataByLanguage.en;
  const articles = resolvedData.articles;
  const isRtl = dir === 'rtl';

  const categoryNameMap = React.useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const cat of activeCategories || []) {
      if (cat && cat.slug && cat.is_active !== false && cat.name) {
        map[cat.slug] = cat.name;
      }
    }
    return map;
  }, [activeCategories]);

  const categories = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const article of articles) {
      const cat = article.category || 'general';
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    for (const cat of activeCategories || []) {
      if (!cat || cat.is_active === false) continue;
      if (!counts.has(cat.slug)) {
        counts.set(cat.slug, 0);
      }
    }
    return Array.from(counts.entries()).map(([category, count]) => ({ category, count }));
  }, [articles, activeCategories]);

  const filteredArticles = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((article) => {
      const matchesCategory =
        categoryFilter === 'all' ||
        (article.category || 'general') === categoryFilter;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        article.title.toLowerCase().includes(q) ||
        article.summary.toLowerCase().includes(q) ||
        (article.category || 'general').toLowerCase().includes(q)
      );
    });
  }, [articles, query, categoryFilter]);

  const hasArticles = articles.length > 0;
  const hasQuery = query.trim().length > 0 || categoryFilter !== 'all';

  const displayCategoryLabel = (category: string) => {
    if (categoryNameMap[category]) return categoryNameMap[category];
    const key = `documentation.categories.${category.replace(/-/g, '')}`;
    const val = t(key, { ns: 'portal', defaultValue: '' });
    return val || category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, ' ');
  };

  return (
    <div className="space-y-6" dir={dir}>
      <PageHeader
        title={t('documentation.title', { ns: 'portal', defaultValue: 'Documentation' })}
        description={t('documentation.description', { ns: 'portal', defaultValue: 'Simple step-by-step guides to help you get the most from Smart Pocket.' })}
        badge={<StatusBadge status="info" label={t('documentation.badge', { ns: 'portal', defaultValue: 'Guides' })} />}
      />

      {hasArticles ? (
        <section className="rounded-[28px] border border-border bg-card px-5 py-6 shadow-card-sm sm:px-6 sm:py-7">
          <div className="max-w-3xl">
            <SearchField
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('documentation.searchPlaceholder', { ns: 'portal', defaultValue: 'Search guides by title, topic, or keyword...' })}
              aria-label={t('documentation.searchPlaceholder', { ns: 'portal', defaultValue: 'Search guides by title, topic, or keyword...' })}
              inputClassName="h-12 rounded-2xl ps-11"
              iconClassName="start-4"
            />
          </div>

          {categories.length > 1 ? (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${
                  categoryFilter === 'all'
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-muted-foreground hover:border-border hover:bg-muted/30 hover:text-foreground'
                }`}
              >
                {t('documentation.allCategories', { ns: 'portal', defaultValue: 'All guides' })}
                <span className="rounded-full bg-background px-1.5 text-[10px] font-800 tabular-nums opacity-80">
                  {articles.length}
                </span>
              </button>
              {categories.map(({ category, count }) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setCategoryFilter(category)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${
                    categoryFilter === category
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-muted-foreground hover:border-border hover:bg-muted/30 hover:text-foreground'
                  }`}
                >
                  {displayCategoryLabel(category)}
                  <span className="rounded-full bg-background px-1.5 text-[10px] font-800 tabular-nums opacity-80">
                    {count}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {!hasArticles ? (
        <section className="rounded-[28px] border border-border bg-card shadow-card-sm">
          <EmptyState
            icon={BookOpen}
            title={t('documentation.emptyTitle', { ns: 'portal', defaultValue: 'No guides yet' })}
            description={t('documentation.emptyDescription', { ns: 'portal', defaultValue: 'Documentation is being prepared. Check back soon or open a support ticket.' })}
            action={{
              label: t('documentation.openSupport', { ns: 'portal', defaultValue: 'Contact Support' }),
              onClick: () => router.push(supportHref),
            }}
          />
        </section>
      ) : filteredArticles.length === 0 && hasQuery ? (
        <section className="rounded-[28px] border border-dashed border-border bg-card shadow-card-sm">
          <EmptyState
            icon={Search}
            title={t('documentation.noResultsTitle', { ns: 'portal', defaultValue: 'No matching guides' })}
            description={t('documentation.noResultsDescription', { ns: 'portal', defaultValue: 'Try a different search word or clear the category filter.' })}
            action={{
              label: t('documentation.clearFilters', { ns: 'portal', defaultValue: 'Clear filters' }),
              onClick: () => {
                setQuery('');
                setCategoryFilter('all');
              },
            }}
            tone="neutral"
          />
        </section>
      ) : (
        <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filteredArticles.map((article) => {
            const cardDir = documentationContentDir(article.localeCode);
            const cardIsRtl = isDocumentationContentRtl(article.localeCode);
            const visual = resolveCategoryVisual(article.category);
            const Icon = visual.icon;
            return (
            <Link
              key={article.id}
              href={`/help/documentation/${article.slug}`}
              dir={cardDir}
              className={`group relative flex h-full flex-col overflow-hidden rounded-[22px] border border-border/80 bg-gradient-to-b from-white to-slate-50/60 p-5 shadow-card-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-card-md ${cardIsRtl ? 'text-right' : 'text-left'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${visual.badgeBg} ${visual.badgeText} ${visual.ring}`}>
                  <Icon size={19} />
                </div>
                {article.category ? (
                  <span className="inline-flex items-center rounded-full bg-muted/70 px-2.5 py-1 text-[11px] font-700 text-muted-foreground ring-1 ring-border/80">
                    {displayCategoryLabel(article.category)}
                  </span>
                ) : null}
              </div>
              <div className="mt-4 min-w-0 flex-1">
                <h3 className={`text-base font-800 text-foreground transition-colors duration-200 group-hover:text-accent ${cardIsRtl ? 'text-right' : 'text-left'}`}>
                  {article.title}
                </h3>
                <p className={`mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground ${cardIsRtl ? 'text-right' : 'text-left'}`}>
                  {article.summary}
                </p>
              </div>
              <div className="mt-5 inline-flex w-full items-center justify-between text-sm font-700 text-accent">
                <span className="tracking-[0.01em]">
                  {t('documentation.readGuide', { ns: 'portal', defaultValue: 'Read guide' })}
                </span>
                <ChevronRight size={16} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
              </div>
            </Link>
            );
          })}
        </section>
      )}

      {hasArticles ? (
        <section className="rounded-[28px] border border-border bg-card px-5 py-6 shadow-card-sm sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-700 text-foreground">
                {t('documentation.supportCtaTitle', { ns: 'portal', defaultValue: "Can't find what you're looking for?" })}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {t('documentation.supportCtaDescription', { ns: 'portal', defaultValue: 'Open a support ticket and our team will help you directly.' })}
              </p>
            </div>
            <Link href={supportHref} className="btn-primary inline-flex min-h-11 items-center justify-center gap-2">
              <LifeBuoy size={16} />
              {t('documentation.createTicketAction', { ns: 'portal', defaultValue: 'Create support ticket' })}
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
