import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { notFound } from 'next/navigation';
import { BASE_I18N_RESOURCES } from '@/i18n/resources';
import CmsHtml from '@/components/cms/CmsHtml';
import StructuredDataScripts from '@/components/seo/StructuredDataScripts';
import BlogCard from '@/components/public/blog/BlogCard';
import { getPublicBlogPostBySlug, listRelatedBlogPosts } from '@/lib/cms-pages-server';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import {
  buildArticleStructuredData,
  buildBreadcrumbStructuredData,
  buildPageMetadata,
  buildAbsoluteSiteUrl,
  resolveMetadataLanguage,
} from '@/lib/site-metadata';

function getBlogText(publicText: Record<string, any>) {
  return publicText.blog || {};
}

function formatDate(value?: string | null, locale = 'en') {
  if (!value) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(value));
  } catch {
    return null;
  }
}

type BlogDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: BlogDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);
  const post = await getPublicBlogPostBySlug(slug);

  if (!post) {
    return buildPageMetadata({
      settings,
      language,
      pathname: `/blog/${slug}`,
      canonicalPath: `/blog/${slug}`,
      title: 'Blog post not found',
      description: 'The requested blog post could not be found.',
      index: false,
      follow: false,
      noIndex: true,
    });
  }

  return buildPageMetadata({
    settings,
    language,
    pathname: `/blog/${post.slug}`,
    canonicalPath: `/blog/${post.slug}`,
    canonicalUrl: post.canonical_url_override || undefined,
    title: post.seo_title_resolved,
    description: post.seo_description_resolved,
    keywords: post.seo_keywords_resolved,
    openGraphTitle: post.og_title_resolved,
    openGraphDescription: post.og_description_resolved,
    twitterTitle: post.twitter_title_resolved,
    twitterDescription: post.twitter_description_resolved,
    socialImageUrl: post.seo_image_url || post.cover_image_url || undefined,
    twitterImageUrl: post.twitter_image_url || post.seo_image_url || post.cover_image_url || undefined,
    openGraphType: 'article',
  });
}

export default async function BlogDetailPage({ params }: BlogDetailPageProps) {
  const { slug } = await params;
  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);
  const publicText = BASE_I18N_RESOURCES[language].public as Record<string, any>;
  const blogText = getBlogText(publicText);
  const common = blogText.common || {};
  const detail = blogText.detail || {};
  const post = await getPublicBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const relatedPosts = await listRelatedBlogPosts(post, 3);
  const postUrl = buildAbsoluteSiteUrl(`/blog/${post.slug}`, settings);
  const dateLabel = formatDate(post.published_at || post.updated_at, language);
  const readingTimeLabel = common.readTime?.replace('{{count}}', String(post.reading_time_minutes || 1)) || `${post.reading_time_minutes || 1} min read`;
  const shareText = encodeURIComponent(post.title);
  const shareUrl = encodeURIComponent(postUrl);

  const structuredData = [
    buildBreadcrumbStructuredData(settings, [
      { name: common.homeLabel || 'Home', path: '/' },
      { name: common.blogLabel || 'Blog', path: '/blog' },
      { name: post.title, path: `/blog/${post.slug}` },
    ]),
    buildArticleStructuredData({
      settings,
      title: post.seo_title_resolved,
      description: post.seo_description_resolved,
      pathname: `/blog/${post.slug}`,
      imageUrl: post.seo_image_url || post.cover_image_url || undefined,
      publishedAt: post.published_at || post.created_at,
      updatedAt: post.updated_at,
      authorName: post.author_name,
      language,
    }),
  ];

  return (
    <div className="min-h-screen bg-[#050a13] text-white">
      <StructuredDataScripts entries={structuredData} />
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <nav aria-label={detail.breadcrumbLabel || 'Breadcrumbs'} className="mb-8 flex flex-wrap items-center gap-2 text-sm text-slate-400">
          <Link href="/" className="transition-colors hover:text-cyan-100">
            {common.homeLabel || 'Home'}
          </Link>
          <ChevronRight size={14} />
          <Link href="/blog" className="transition-colors hover:text-cyan-100">
            {common.blogLabel || 'Blog'}
          </Link>
          <ChevronRight size={14} />
          <span className="text-slate-200">{post.title}</span>
        </nav>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <article className="min-w-0">
            <header className="max-w-4xl">
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-700 uppercase tracking-[0.18em] text-cyan-200/80">
                {post.category ? <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1">{post.category}</span> : null}
                {dateLabel ? <span>{dateLabel}</span> : null}
                <span>{readingTimeLabel}</span>
              </div>
              <h1 className="text-4xl font-800 tracking-tight text-white sm:text-5xl">{post.title}</h1>
              {post.excerpt_resolved ? (
                <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">{post.excerpt_resolved}</p>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-slate-400">
                {post.author_name ? <span>{post.author_name}</span> : null}
                {post.author_name && dateLabel ? <span>•</span> : null}
                {dateLabel ? <span>{dateLabel}</span> : null}
              </div>
            </header>

            {post.cover_image_url ? (
              <img
                src={post.cover_image_url}
                alt={post.cover_image_alt || post.title}
                className="mt-8 aspect-[16/9] w-full rounded-[32px] object-cover shadow-[0_32px_90px_rgba(2,8,23,0.35)]"
              />
            ) : null}

            <div className="mt-10 max-w-4xl">
              <CmsHtml
                html={post.content_html_sanitized}
                className="prose prose-invert prose-lg max-w-none leading-8 prose-headings:font-800 prose-a:text-cyan-200 prose-blockquote:border-l-cyan-300/50 prose-blockquote:text-slate-200 prose-strong:text-white prose-li:my-1"
              />
            </div>

            {post.tags && post.tags.length > 0 ? (
              <div className="mt-10 flex flex-wrap gap-3">
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/blog?tag=${encodeURIComponent(tag)}`}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:border-cyan-300/60 hover:text-cyan-100"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            ) : null}
          </article>

          <aside className="space-y-6">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <h2 className="text-lg font-700 text-white">{detail.shareTitle || 'Share this article'}</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm font-700">
                <Link
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`}
                  target="_blank"
                  className="rounded-2xl border border-white/10 px-4 py-3 text-center text-slate-200 transition-colors hover:border-cyan-300/60 hover:text-cyan-100"
                >
                  LinkedIn
                </Link>
                <Link
                  href={`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`}
                  target="_blank"
                  className="rounded-2xl border border-white/10 px-4 py-3 text-center text-slate-200 transition-colors hover:border-cyan-300/60 hover:text-cyan-100"
                >
                  X
                </Link>
                <Link
                  href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`}
                  target="_blank"
                  className="rounded-2xl border border-white/10 px-4 py-3 text-center text-slate-200 transition-colors hover:border-cyan-300/60 hover:text-cyan-100"
                >
                  Facebook
                </Link>
                <Link
                  href={`https://wa.me/?text=${shareText}%20${shareUrl}`}
                  target="_blank"
                  className="rounded-2xl border border-white/10 px-4 py-3 text-center text-slate-200 transition-colors hover:border-cyan-300/60 hover:text-cyan-100"
                >
                  WhatsApp
                </Link>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,25,44,0.92),rgba(6,14,25,0.98))] p-6">
              <p className="text-xs font-700 uppercase tracking-[0.22em] text-cyan-200/80">{detail.ctaEyebrow || 'Ready to review before you save?'}</p>
              <h2 className="mt-3 text-2xl font-800 text-white">
                {detail.ctaTitle || 'Let Smart Pocket prepare the details, then stay in control.'}
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                {detail.ctaDescription || 'Upload receipts, track subscriptions, and keep shared expenses simple with AI-assisted review flows.'}
              </p>
              <div className="mt-5 flex flex-col gap-3">
                <Link
                  href="/sign-up-login"
                  className="inline-flex h-11 items-center justify-center rounded-full bg-cyan-300 px-5 text-sm font-700 text-slate-950 transition-transform hover:-translate-y-0.5"
                >
                  {detail.ctaPrimaryLabel || 'Start Free Trial'}
                  <ArrowRight size={16} className="ms-2" />
                </Link>
                <Link
                  href="/"
                  className="inline-flex h-11 items-center justify-center rounded-full border border-white/15 px-5 text-sm font-700 text-white transition-colors hover:border-cyan-300/60 hover:text-cyan-100"
                >
                  {detail.ctaSecondaryLabel || 'See Smart Pocket'}
                </Link>
              </div>
            </div>
          </aside>
        </div>

        {relatedPosts.length > 0 ? (
          <section className="mt-16">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-700 uppercase tracking-[0.22em] text-cyan-200/80">{detail.relatedEyebrow || 'Keep reading'}</p>
                <h2 className="mt-2 text-2xl font-800 text-white">{detail.relatedTitle || 'Related articles'}</h2>
              </div>
              <Link href="/blog" className="text-sm font-700 text-cyan-200 transition-colors hover:text-cyan-100">
                {detail.relatedAction || 'Browse all posts'}
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              {relatedPosts.map((relatedPost) => (
                <BlogCard
                  key={relatedPost.id}
                  post={{
                    slug: relatedPost.slug,
                    title: relatedPost.title,
                    excerpt: relatedPost.excerpt_resolved,
                    coverImageUrl: relatedPost.cover_image_url,
                    coverImageAlt: relatedPost.cover_image_alt,
                    category: relatedPost.category,
                    authorName: relatedPost.author_name,
                    publishedAt: relatedPost.published_at || relatedPost.updated_at,
                    readingTimeMinutes: relatedPost.reading_time_minutes,
                    tags: relatedPost.tags || [],
                  }}
                  locale={language}
                  readTimeLabel={(minutes) =>
                    common.readTime?.replace('{{count}}', String(minutes)) || `${minutes} min read`
                  }
                  readArticleLabel={common.readArticleLabel || 'Read article'}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
