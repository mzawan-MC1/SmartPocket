'use client';

import { useMemo, useState } from 'react';
import BlogCard, { type BlogCardData } from '@/components/public/blog/BlogCard';

export default function BlogArchiveClient({
  posts,
  locale,
  eyebrow,
  initialQuery = '',
  initialCategory = '',
  initialTag = '',
  title,
  description,
  searchPlaceholder,
  searchLabel,
  categoryLabel,
  categoryAllLabel,
  tagLabel,
  tagAllLabel,
  emptyTitle,
  emptyDescription,
  emptyPublishedTitle,
  emptyPublishedDescription,
  readTimeLabel,
  readArticleLabel,
}: {
  posts: BlogCardData[];
  locale: string;
  eyebrow: string;
  initialQuery?: string;
  initialCategory?: string;
  initialTag?: string;
  title: string;
  description: string;
  searchPlaceholder: string;
  searchLabel: string;
  categoryLabel: string;
  categoryAllLabel: string;
  tagLabel: string;
  tagAllLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyPublishedTitle: string;
  emptyPublishedDescription: string;
  readTimeLabel: (minutes: number) => string;
  readArticleLabel: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [tag, setTag] = useState(initialTag);

  const categories = useMemo(
    () => Array.from(new Set(posts.map((post) => (post.category || '').trim()).filter(Boolean))).sort(),
    [posts]
  );
  const tags = useMemo(
    () => Array.from(new Set(posts.flatMap((post) => (post.tags || []).map((entry) => entry.trim())).filter(Boolean))).sort(),
    [posts]
  );

  const filteredPosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedCategory = category.trim().toLowerCase();
    const normalizedTag = tag.trim().toLowerCase();
    const safePosts = Array.isArray(posts) ? posts : [];

    return safePosts.filter((post) => {
      const title = typeof post.title === 'string' ? post.title : '';
      const excerpt = typeof post.excerpt === 'string' ? post.excerpt : '';
      const safeCategory = typeof post.category === 'string' ? post.category : '';
      const safeTags = Array.isArray(post.tags)
        ? post.tags.map((entry) => (typeof entry === 'string' ? entry : '')).filter(Boolean)
        : [];

      const matchesQuery =
        !normalizedQuery ||
        title.toLowerCase().includes(normalizedQuery) ||
        excerpt.toLowerCase().includes(normalizedQuery) ||
        safeCategory.toLowerCase().includes(normalizedQuery) ||
        safeTags.some((entry) => entry.toLowerCase().includes(normalizedQuery));

      const matchesCategory = !normalizedCategory || safeCategory.toLowerCase() === normalizedCategory;
      const matchesTag = !normalizedTag || safeTags.some((entry) => entry.toLowerCase() === normalizedTag);

      return matchesQuery && matchesCategory && matchesTag;
    });
  }, [category, posts, query, tag]);

  const hasActiveFilters = Boolean(query.trim() || category.trim() || tag.trim());
  const emptyStateTitle = !hasActiveFilters && posts.length === 0 ? emptyPublishedTitle : emptyTitle;
  const emptyStateDescription =
    !hasActiveFilters && posts.length === 0 ? emptyPublishedDescription : emptyDescription;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
      <div className="max-w-3xl">
        <p className="text-xs font-700 uppercase tracking-[0.3em] text-cyan-300">{eyebrow}</p>
        <h1 className="mt-4 text-4xl font-800 tracking-tight text-white sm:text-5xl">{title}</h1>
        <p className="mt-4 text-base leading-7 text-slate-300 sm:text-lg">{description}</p>
      </div>

      <div className="mt-8 rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.75fr)_minmax(0,0.75fr)]">
          <div>
            <label className="mb-2 block text-sm font-600 text-slate-200">{searchLabel}</label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-12 w-full rounded-2xl border border-white/10 bg-[#09101d] px-4 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-300/60"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-600 text-slate-200">{categoryLabel}</label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-12 w-full rounded-2xl border border-white/10 bg-[#09101d] px-4 text-sm text-white outline-none transition-colors focus:border-cyan-300/60"
            >
              <option value="">{categoryAllLabel}</option>
              {categories.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-600 text-slate-200">{tagLabel}</label>
            <select
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              className="h-12 w-full rounded-2xl border border-white/10 bg-[#09101d] px-4 text-sm text-white outline-none transition-colors focus:border-cyan-300/60"
            >
              <option value="">{tagAllLabel}</option>
              {tags.map((entry) => (
                <option key={entry} value={entry}>
                  #{entry}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {filteredPosts.length === 0 ? (
        <div className="mt-10 rounded-[28px] border border-dashed border-white/15 bg-white/5 px-6 py-14 text-center">
          <h2 className="text-xl font-700 text-white">{emptyStateTitle}</h2>
          <p className="mt-3 text-sm text-slate-300">{emptyStateDescription}</p>
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {filteredPosts.map((post) => (
            <BlogCard
              key={post.slug}
              post={post}
              locale={locale}
              readTimeLabel={readTimeLabel}
              readArticleLabel={readArticleLabel}
            />
          ))}
        </div>
      )}
    </div>
  );
}
