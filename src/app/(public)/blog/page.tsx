import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import TrackedAnalyticsLink from '@/components/analytics/TrackedAnalyticsLink';
import { BASE_I18N_RESOURCES } from '@/i18n/resources';
import BlogArchiveClient from '@/components/public/blog/BlogArchiveClient';
import { listPublicBlogPosts, type PublicCmsPage } from '@/lib/cms-pages-server';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { buildBreadcrumbStructuredData, buildPageMetadata, resolveMetadataLanguage } from '@/lib/site-metadata';
import StructuredDataScripts from '@/components/seo/StructuredDataScripts';

type BlogArchivePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getBlogText(publicText: Record<string, any>) {
  return publicText.blog || {};
}

function normalizeArchiveText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function normalizeArchiveTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);
  const publicText = BASE_I18N_RESOURCES[language].public as Record<string, any>;
  const blogText = getBlogText(publicText);
  const listing = blogText.listing || {};

  return buildPageMetadata({
    settings,
    language,
    pathname: '/blog',
    canonicalPath: '/blog',
    title:
      listing.seoTitle ||
      'Smart Pocket Blog | Personal Finance, Budgeting & AI Expense Tracking',
    description:
      listing.seoDescription ||
      'Read Smart Pocket guides about budgeting, subscriptions, receipts, AI expense tracking, shared money, and smarter personal finance.',
    openGraphTitle:
      listing.ogTitle ||
      listing.seoTitle ||
      'Smart Pocket Blog | Personal Finance, Budgeting & AI Expense Tracking',
    openGraphDescription:
      listing.ogDescription ||
      listing.seoDescription ||
      'Read Smart Pocket guides about budgeting, subscriptions, receipts, AI expense tracking, shared money, and smarter personal finance.',
    twitterTitle:
      listing.twitterTitle ||
      listing.ogTitle ||
      listing.seoTitle ||
      'Smart Pocket Blog | Personal Finance, Budgeting & AI Expense Tracking',
    twitterDescription:
      listing.twitterDescription ||
      listing.ogDescription ||
      listing.seoDescription ||
      'Read Smart Pocket guides about budgeting, subscriptions, receipts, AI expense tracking, shared money, and smarter personal finance.',
  });
}

export default async function BlogArchivePage({ searchParams }: BlogArchivePageProps) {
  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);
  const publicText = BASE_I18N_RESOURCES[language].public as Record<string, any>;
  const blogText = getBlogText(publicText);
  const listing = blogText.listing || {};
  const common = blogText.common || {};
  const params = searchParams ? await searchParams : {};
  let posts: PublicCmsPage[] = [];

  try {
    posts = await listPublicBlogPosts();
  } catch {
    posts = [];
  }

  const structuredData = [
    buildBreadcrumbStructuredData(settings, [
      { name: common.homeLabel || 'Home', path: '/' },
      { name: listing.title || 'Blog', path: '/blog' },
    ]),
  ];

  const mappedPosts = posts.map((post) => ({
    slug: normalizeArchiveText(post.slug),
    title: normalizeArchiveText(post.title, 'Untitled post'),
    excerpt: normalizeArchiveText(
      post.excerpt_resolved,
      normalizeArchiveText(
        post.seo_description_resolved,
        listing.cardExcerptFallback || 'Read the latest Smart Pocket guide on budgeting, receipts, and everyday money habits.'
      )
    ),
    coverImageUrl: normalizeArchiveText(post.cover_image_url, ''),
    coverImageAlt: normalizeArchiveText(post.cover_image_alt, ''),
    category: normalizeArchiveText(post.category, ''),
    authorName: normalizeArchiveText(post.author_name, ''),
    publishedAt: normalizeArchiveText(post.published_at || post.updated_at, ''),
    readingTimeMinutes:
      typeof post.reading_time_minutes === 'number' && Number.isFinite(post.reading_time_minutes)
        ? post.reading_time_minutes
        : null,
    tags: normalizeArchiveTags(post.tags),
  }));

  const query = Array.isArray(params.q) ? params.q[0] : params.q || '';
  const category = Array.isArray(params.category) ? params.category[0] : params.category || '';
  const tag = Array.isArray(params.tag) ? params.tag[0] : params.tag || '';

  return (
    <div className="min-h-screen bg-[#050a13] text-white">
      <StructuredDataScripts entries={structuredData} />
      <BlogArchiveClient
        posts={mappedPosts}
        locale={language}
        eyebrow={common.blogLabel || 'Blog'}
        initialQuery={query}
        initialCategory={category}
        initialTag={tag}
        title={listing.title || 'Smart Pocket Blog'}
        description={
          listing.description ||
          'Read Smart Pocket guides about personal finance, budgeting, AI expense tracking, receipts, and smarter money management.'
        }
        searchPlaceholder={listing.searchPlaceholder || 'Search articles'}
        searchLabel={listing.searchLabel || 'Search'}
        categoryLabel={listing.categoryLabel || 'Category'}
        categoryAllLabel={listing.categoryAllLabel || 'All categories'}
        tagLabel={listing.tagLabel || 'Tag'}
        tagAllLabel={listing.tagAllLabel || 'All tags'}
        emptyTitle={listing.emptyTitle || 'No posts match your filters'}
        emptyDescription={listing.emptyDescription || 'Try a different keyword, category, or tag.'}
        emptyPublishedTitle={listing.emptyPublishedTitle || 'No blog posts published yet.'}
        emptyPublishedDescription={listing.emptyPublishedDescription || 'Check back soon.'}
        readTimeTemplate={common.readTime || '{{count}} min read'}
        readArticleLabel={common.readArticleLabel || 'Read article'}
      />

      <section className="border-t border-white/10 bg-[linear-gradient(180deg,rgba(6,12,23,0.96),rgba(3,7,14,0.98))] py-20">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-700 uppercase tracking-[0.22em] text-cyan-100">
              <Sparkles size={12} />
              {listing.ctaEyebrow || 'Start with Smart Pocket'}
            </div>
            <h2 className="mt-5 text-3xl font-800 tracking-tight text-white sm:text-4xl">
              {listing.ctaTitle || 'Ready to turn money notes, receipts, and shared spending into a cleaner routine?'}
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-300">
              {listing.ctaDescription || 'Use Smart Pocket to review AI-assisted suggestions, stay on top of budgets, and keep daily money tasks simple.'}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <TrackedAnalyticsLink
              href="/sign-up-login"
              eventName="sp_signup_click"
              eventParams={{ source: 'blog_archive_cta' }}
              className="inline-flex h-12 items-center justify-center rounded-full bg-cyan-300 px-6 text-sm font-700 text-slate-950 transition-transform hover:-translate-y-0.5"
            >
              {listing.ctaPrimaryLabel || 'Start Free Trial'}
              <ArrowRight size={16} className="ms-2" />
            </TrackedAnalyticsLink>
            <Link
              href="/"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-700 text-white transition-colors hover:border-cyan-300/60 hover:text-cyan-100"
            >
              {listing.ctaSecondaryLabel || 'See Smart Pocket'}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
