'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen, ChevronRight, Search, LifeBuoy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import PageHeader from '@/components/ui/PageHeader';
import SearchField from '@/components/ui/SearchField';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import CmsHtml from '@/components/cms/CmsHtml';
import {
  normalizeDocumentationLanguage,
  type DocumentationLanguageCode,
  type PublicDocumentationArticle,
} from '@/lib/documentation';
import type { SupportedLanguage } from '@/i18n/resources';

export default function PublicDocumentationClient({
  dataByLanguage,
  supportHref,
}: {
  dataByLanguage: Record<
    SupportedLanguage,
    { articles: PublicDocumentationArticle[]; effectiveLocale: DocumentationLanguageCode }
  >;
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

  const categories = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const article of articles) {
      const cat = article.category || 'general';
      map.set(cat, (map.get(cat) || 0) + 1);
    }
    return Array.from(map.entries()).map(([category, count]) => ({ category, count }));
  }, [articles]);

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
          {filteredArticles.map((article) => (
            <Link
              key={article.id}
              href={`/help/documentation/${article.slug}`}
              className="card-elevated group flex h-full flex-col p-5 transition-shadow hover:shadow-card-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <BookOpen size={18} />
                </div>
                {article.category ? (
                  <Badge variant="default">{displayCategoryLabel(article.category)}</Badge>
                ) : null}
              </div>
              <div className="mt-4 min-w-0 flex-1">
                <h3 className="text-base font-800 text-foreground group-hover:text-accent transition-colors">
                  {article.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground line-clamp-3">
                  {article.summary}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[11px] font-700 uppercase tracking-[0.12em] text-muted-foreground">
                  {t('documentation.readGuide', { ns: 'portal', defaultValue: 'Read guide' })}
                </span>
                <ChevronRight size={16} className="text-accent" />
              </div>
            </Link>
          ))}
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
