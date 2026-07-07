import Link from 'next/link';

export type BlogCardData = {
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl?: string | null;
  coverImageAlt?: string | null;
  category?: string | null;
  authorName?: string | null;
  publishedAt?: string | null;
  readingTimeMinutes?: number | null;
  tags?: string[] | null;
};

function formatDate(value?: string | null, locale = 'en') {
  if (!value) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(value));
  } catch {
    return null;
  }
}

export default function BlogCard({
  post,
  locale,
  href,
  readTimeLabel,
  readArticleLabel,
}: {
  post: BlogCardData;
  locale: string;
  href?: string;
  readTimeLabel: (minutes: number) => string;
  readArticleLabel: string;
}) {
  const linkHref = href || `/blog/${post.slug}`;
  const publishedLabel = formatDate(post.publishedAt, locale);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0f1726]/80 shadow-[0_24px_80px_rgba(7,12,24,0.18)] backdrop-blur-sm transition-transform duration-200 hover:-translate-y-1">
      {post.coverImageUrl ? (
        <Link href={linkHref} className="block">
          <img
            src={post.coverImageUrl}
            alt={post.coverImageAlt || post.title}
            className="aspect-[16/9] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </Link>
      ) : null}
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-600 text-slate-300">
          {post.category ? (
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-white">{post.category}</span>
          ) : null}
          {publishedLabel ? <span>{publishedLabel}</span> : null}
          {post.readingTimeMinutes ? <span>{readTimeLabel(post.readingTimeMinutes)}</span> : null}
        </div>

        <div className="space-y-3">
          <h3 className="text-xl font-700 leading-tight text-white">
            <Link href={linkHref} className="transition-colors hover:text-cyan-200">
              {post.title}
            </Link>
          </h3>
          <p className="line-clamp-3 text-sm leading-6 text-slate-300">{post.excerpt}</p>
        </div>

        <div className="mt-auto space-y-3">
          {post.tags && post.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {post.tags.slice(0, 4).map((tag) => (
                <Link
                  key={tag}
                  href={`/blog?tag=${encodeURIComponent(tag)}`}
                  className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-slate-300 transition-colors hover:border-cyan-300/60 hover:text-cyan-100"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-slate-400">{post.authorName || ''}</p>
            <Link href={linkHref} className="text-sm font-700 text-cyan-200 transition-colors hover:text-cyan-100">
              {readArticleLabel}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
