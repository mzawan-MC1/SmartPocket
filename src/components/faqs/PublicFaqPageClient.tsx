'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, LifeBuoy, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CmsHtml from '@/components/cms/CmsHtml';
import SearchField from '@/components/ui/SearchField';
import FaqCategoryIcon from '@/components/faqs/FaqCategoryIcon';
import type { PublicFaqCategory, PublicFaqItem } from '@/lib/faqs';
import { formatFaqHash, hashToFaqSlug } from '@/lib/faqs';

function normalizeQuery(value: string) {
  return value.trim().toLowerCase();
}

export default function PublicFaqPageClient({
  categories,
  items,
  supportHref,
}: {
  categories: PublicFaqCategory[];
  items: PublicFaqItem[];
  supportHref: string;
}) {
  const { t } = useTranslation('public');
  const pathname = usePathname();
  const [query, setQuery] = React.useState('');
  const [openSlug, setOpenSlug] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('all');

  const itemBySlug = React.useMemo(
    () => new Map(items.map((item) => [item.slug, item] as const)),
    [items]
  );
  const categoryBySlug = React.useMemo(
    () => new Map(categories.map((category) => [category.slug, category] as const)),
    [categories]
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const categoryParam = params.get('category') || 'all';
      const requestedSlug = hashToFaqSlug(window.location.hash.replace(/^#/, ''));
      const linkedItem = requestedSlug ? itemBySlug.get(requestedSlug) : null;
      const nextCategory =
        linkedItem?.categorySlug ||
        (categoryParam === 'all' || categoryBySlug.has(categoryParam) ? categoryParam : 'all');

      setSelectedCategory(nextCategory);
      setOpenSlug(linkedItem ? requestedSlug : '');
    };

    syncFromLocation();
    window.addEventListener('hashchange', syncFromLocation);
    window.addEventListener('popstate', syncFromLocation);

    return () => {
      window.removeEventListener('hashchange', syncFromLocation);
      window.removeEventListener('popstate', syncFromLocation);
    };
  }, [categoryBySlug, itemBySlug]);

  const updateUrlState = React.useCallback(
    (categorySlug: string, accordionSlug: string) => {
      if (typeof window === 'undefined') {
        return;
      }

      const params = new URLSearchParams(window.location.search);
      if (categorySlug === 'all') {
        params.delete('category');
      } else {
        params.set('category', categorySlug);
      }

      const nextQuery = params.toString();
      const hash = accordionSlug ? `#${formatFaqHash(accordionSlug)}` : '';
      const nextUrl = `${pathname}${nextQuery ? `?${nextQuery}` : ''}${hash}`;
      window.history.replaceState(window.history.state, '', nextUrl);
    },
    [pathname]
  );

  const filteredItems = React.useMemo(() => {
    const normalizedQuery = normalizeQuery(query);
    return items.filter((item) => {
      const matchesCategory = selectedCategory === 'all' || item.categorySlug === selectedCategory;
      if (!matchesCategory) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        item.question.toLowerCase().includes(normalizedQuery) ||
        item.answerText.toLowerCase().includes(normalizedQuery) ||
        item.keywords.some((keyword) => keyword.toLowerCase().includes(normalizedQuery))
      );
    });
  }, [items, query, selectedCategory]);

  const categoryCounts = React.useMemo(
    () =>
      items.reduce<Record<string, number>>((counts, item) => {
        counts[item.categorySlug] = (counts[item.categorySlug] || 0) + 1;
        return counts;
      }, {}),
    [items]
  );

  const selectedCategoryRecord = selectedCategory === 'all' ? null : categoryBySlug.get(selectedCategory);
  const resultLabel =
    filteredItems.length === 1 ? t('faqs.questionSingular') : t('faqs.questionPlural');

  const handleCategoryChange = (slug: string) => {
    setSelectedCategory(slug);
    setOpenSlug('');
    updateUrlState(slug, '');
  };

  const handleAccordionToggle = (slug: string) => {
    const nextSlug = openSlug === slug ? '' : slug;
    setOpenSlug(nextSlug);
    updateUrlState(selectedCategory, nextSlug);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-border bg-card px-5 py-6 shadow-card-sm sm:px-6 sm:py-7">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-800 text-foreground sm:text-4xl">
            {t('faqs.title')}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
            {t('faqs.introduction')}
          </p>
        </div>

        <div className="mt-5">
          <SearchField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('faqs.searchPlaceholder')}
            aria-label={t('faqs.searchPlaceholder')}
            inputClassName="h-11 rounded-2xl ps-11"
            iconClassName="start-4"
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden h-fit rounded-[28px] border border-border bg-card p-4 shadow-card-sm lg:block">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleCategoryChange('all')}
              className={`flex min-h-12 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${
                selectedCategory === 'all'
                  ? 'border-accent bg-accent/10 text-accent shadow-sm'
                  : 'border-transparent text-foreground hover:border-border hover:bg-muted/30'
              }`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selectedCategory === 'all' ? 'bg-accent text-accent-foreground' : 'bg-accent/10 text-accent'}`}>
                <FaqCategoryIcon icon="circle-help" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-700 text-start">
                {t('faqs.allCategories')}
              </span>
              <span
                dir="ltr"
                className={`ms-auto inline-flex min-w-8 shrink-0 items-center justify-center rounded-full px-2.5 py-1 text-xs font-700 tabular-nums ${
                  selectedCategory === 'all'
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {items.length}
              </span>
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => handleCategoryChange(category.slug)}
                className={`flex min-h-12 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${
                  selectedCategory === category.slug
                    ? 'border-accent bg-accent/10 text-accent shadow-sm'
                    : 'border-transparent text-foreground hover:border-border hover:bg-muted/30'
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    selectedCategory === category.slug
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-accent/10 text-accent'
                  }`}
                >
                  <FaqCategoryIcon icon={category.icon} />
                </span>
                <span className="min-w-0 flex-1 text-sm font-700 text-start">
                  <span className="block truncate">{category.name}</span>
                </span>
                <span
                  dir="ltr"
                  className={`ms-auto inline-flex min-w-8 shrink-0 items-center justify-center rounded-full px-2.5 py-1 text-xs font-700 tabular-nums ${
                    selectedCategory === category.slug
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {categoryCounts[category.slug] || 0}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-border bg-card p-4 shadow-card-sm lg:hidden">
            <label className="block text-sm font-700 text-foreground" htmlFor="faq-category-select">
              {t('faqs.categoriesLabel')}
            </label>
            <div className="mt-3">
              <select
                id="faq-category-select"
                value={selectedCategory}
                onChange={(event) => handleCategoryChange(event.target.value)}
                className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm font-600 text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              >
                <option value="all">
                  {t('faqs.allCategories')} ({items.length})
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name} ({categoryCounts[category.slug] || 0})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-[28px] border border-border bg-card px-5 py-4 shadow-card-sm sm:px-6">
            <div className="min-w-0">
              <p className="text-xs font-700 uppercase tracking-[0.14em] text-muted-foreground">
                {selectedCategoryRecord?.name || t('faqs.allCategories')}
              </p>
              <p className="mt-2 text-lg font-700 text-foreground">
                <span dir="ltr" className="inline-block tabular-nums">
                  {filteredItems.length}
                </span>{' '}
                {resultLabel}
              </p>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-border bg-card px-6 py-12 text-center shadow-card-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Search size={20} />
              </div>
              <h2 className="mt-4 text-lg font-700 text-foreground">
                {t('faqs.emptyTitle')}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t('faqs.emptyDescription')}
              </p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isOpen = openSlug === item.slug;
              return (
                <article
                  key={item.id}
                  id={formatFaqHash(item.slug)}
                  className="overflow-hidden rounded-[28px] border border-border bg-card shadow-card-sm"
                >
                  <button
                    type="button"
                    onClick={() => handleAccordionToggle(item.slug)}
                    className="flex w-full items-start gap-4 px-5 py-5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-inset sm:px-6"
                    aria-expanded={isOpen}
                    aria-controls={`${formatFaqHash(item.slug)}-answer`}
                  >
                    <span className="mt-0.5 flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                      <FaqCategoryIcon icon={categoryBySlug.get(item.categorySlug)?.icon} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-700 uppercase tracking-[0.12em] text-muted-foreground">
                          {categoryBySlug.get(item.categorySlug)?.name || t('faqs.uncategorized')}
                        </span>
                        {item.isFeatured ? (
                          <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-700 uppercase tracking-[0.12em] text-accent">
                            {t('faqs.featured')}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-3 block text-base font-700 leading-7 text-foreground sm:text-lg">
                        {item.question}
                      </span>
                    </span>
                    <ChevronDown
                      size={20}
                      className={`mt-1 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isOpen ? (
                    <div
                      id={`${formatFaqHash(item.slug)}-answer`}
                      className="border-t border-border px-5 py-5 sm:px-6"
                    >
                      <CmsHtml
                        html={item.answerHtml}
                        className="prose prose-slate max-w-none text-sm leading-7 text-muted-foreground [&_a]:text-accent [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground"
                      />
                    </div>
                  ) : null}
                </article>
              );
            })
          )}

          <div className="rounded-[28px] border border-border bg-card px-5 py-6 shadow-card-sm sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-xl font-700 text-foreground">
                  {t('faqs.supportCtaTitle')}
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {t('faqs.supportCtaDescription')}
                </p>
              </div>
              <Link href={supportHref} className="btn-primary inline-flex min-h-11 items-center justify-center gap-2">
                <LifeBuoy size={16} />
                {t(supportHref === '/support/new' ? 'faqs.createTicketAction' : 'faqs.contactAction')}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
