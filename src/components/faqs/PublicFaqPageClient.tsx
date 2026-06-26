'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = React.useState('');
  const [openSlug, setOpenSlug] = React.useState('');

  const categoryParam = searchParams.get('category') || 'all';
  const requestedSlug = React.useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return hashToFaqSlug(window.location.hash.replace(/^#/, ''));
  }, [searchParams]);

  const itemBySlug = React.useMemo(
    () => new Map(items.map((item) => [item.slug, item] as const)),
    [items]
  );
  const categoryBySlug = React.useMemo(
    () => new Map(categories.map((category) => [category.slug, category] as const)),
    [categories]
  );

  const resolvedCategory = React.useMemo(() => {
    if (requestedSlug) {
      const linkedItem = itemBySlug.get(requestedSlug);
      if (linkedItem) {
        return linkedItem.categorySlug;
      }
    }
    return categoryParam;
  }, [categoryParam, itemBySlug, requestedSlug]);

  React.useEffect(() => {
    if (requestedSlug && itemBySlug.has(requestedSlug)) {
      setOpenSlug(requestedSlug);
    }
  }, [itemBySlug, requestedSlug]);

  const filteredItems = React.useMemo(() => {
    const normalizedQuery = normalizeQuery(query);
    return items.filter((item) => {
      const matchesCategory = resolvedCategory === 'all' || item.categorySlug === resolvedCategory;
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
  }, [items, query, resolvedCategory]);

  const visibleCategorySlugs = React.useMemo(
    () => new Set(filteredItems.map((item) => item.categorySlug)),
    [filteredItems]
  );

  const handleCategoryChange = (slug: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (slug === 'all') {
      params.delete('category');
    } else {
      params.set('category', slug);
    }
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  };

  const handleAccordionToggle = (slug: string) => {
    const nextSlug = openSlug === slug ? '' : slug;
    setOpenSlug(nextSlug);

    const params = new URLSearchParams(searchParams.toString());
    const nextQuery = params.toString();
    const hash = nextSlug ? `#${formatFaqHash(nextSlug)}` : '';
    router.replace(`${pathname}${nextQuery ? `?${nextQuery}` : ''}${hash}`, { scroll: false });
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

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-700 uppercase tracking-[0.14em] text-muted-foreground">
            {t('faqs.categoriesLabel')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {filteredItems.length} {t('faqs.resultsLabel')}
          </p>
        </div>
        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-full gap-2">
            <button
              type="button"
              onClick={() => handleCategoryChange('all')}
              className={`inline-flex min-h-11 items-center justify-center rounded-2xl border px-4 py-2 text-sm font-700 whitespace-nowrap transition-colors ${
                resolvedCategory === 'all'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-card text-foreground hover:border-accent/40'
              }`}
            >
              {t('faqs.allCategories')}
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => handleCategoryChange(category.slug)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-700 whitespace-nowrap transition-colors ${
                  resolvedCategory === category.slug
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-card text-foreground hover:border-accent/40'
                }`}
              >
                <FaqCategoryIcon icon={category.icon} size={16} />
                {category.name}
                {visibleCategorySlugs.has(category.slug) ? null : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-700 text-muted-foreground">
                    0
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden h-fit rounded-[28px] border border-border bg-card p-4 shadow-card-sm lg:block">
          <div className="space-y-2">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => handleCategoryChange(category.slug)}
                className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-start transition-colors ${
                  resolvedCategory === category.slug
                    ? 'border-accent bg-accent/10'
                    : 'border-transparent hover:border-border hover:bg-muted/30'
                }`}
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <FaqCategoryIcon icon={category.icon} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-700 text-foreground">{category.name}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {category.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="space-y-4">
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
