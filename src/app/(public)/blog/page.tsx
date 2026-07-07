import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { BASE_I18N_RESOURCES } from '@/i18n/resources';
import BlogArchiveClient from '@/components/public/blog/BlogArchiveClient';
import { listPublicBlogPosts } from '@/lib/cms-pages-server';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { buildBreadcrumbStructuredData, buildPageMetadata, resolveMetadataLanguage } from '@/lib/site-metadata';
import StructuredDataScripts from '@/components/seo/StructuredDataScripts';

type BlogArchivePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getBlogText(publicText: Record<string, any>) {
  return publicText.blog || {};
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
    title: listing.seoTitle || listing.title || 'Smart Pocket Blog',
    description:
      listing.seoDescription ||
      listing.description ||
      'Read practical Smart Pocket guides on receipts, budgeting, subscriptions, and shared expenses.',
    openGraphTitle: listing.ogTitle || listing.seoTitle || listing.title,
    openGraphDescription: listing.ogDescription || listing.seoDescription || listing.description,
    twitterTitle: listing.twitterTitle || listing.ogTitle || listing.seoTitle || listing.title,
    twitterDescription:
      listing.twitterDescription || listing.ogDescription || listing.seoDescription || listing.description,
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
  const posts = await listPublicBlogPosts();

  const structuredData = [
    buildBreadcrumbStructuredData(settings, [
      { name: common.homeLabel || 'Home', path: '/' },
      { name: listing.title || 'Blog', path: '/blog' },
    ]),
  ];

  const mappedPosts = posts.map((post) => ({
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt_resolved,
    coverImageUrl: post.cover_image_url,
    coverImageAlt: post.cover_image_alt,
    category: post.category,
    authorName: post.author_name,
    publishedAt: post.published_at || post.updated_at,
    readingTimeMinutes: post.reading_time_minutes,
    tags: post.tags || [],
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
          'Simple, practical guides for budgeting, receipts, subscriptions, and everyday money habits.'
        }
        searchPlaceholder={listing.searchPlaceholder || 'Search articles'}
        searchLabel={listing.searchLabel || 'Search'}
        categoryLabel={listing.categoryLabel || 'Category'}
        categoryAllLabel={listing.categoryAllLabel || 'All categories'}
        tagLabel={listing.tagLabel || 'Tag'}
        tagAllLabel={listing.tagAllLabel || 'All tags'}
        emptyTitle={listing.emptyTitle || 'No posts match your filters'}
        emptyDescription={listing.emptyDescription || 'Try a different keyword, category, or tag.'}
        readTimeLabel={(minutes) =>
          common.readTime?.replace('{{count}}', String(minutes)) || `${minutes} min read`
        }
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
            <Link
              href="/sign-up-login"
              className="inline-flex h-12 items-center justify-center rounded-full bg-cyan-300 px-6 text-sm font-700 text-slate-950 transition-transform hover:-translate-y-0.5"
            >
              {listing.ctaPrimaryLabel || 'Start Free Trial'}
              <ArrowRight size={16} className="ms-2" />
            </Link>
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
