import Link from 'next/link';
import BlogCard, { type BlogCardData } from '@/components/public/blog/BlogCard';

export default function FeaturedBlogSection({
  posts,
  locale,
  eyebrow,
  title,
  description,
  readTimeLabel,
  readArticleLabel,
  viewAllLabel,
  fallbackTitle,
  fallbackExcerpt,
  fallbackBadgeLabel,
}: {
  posts: BlogCardData[];
  locale: string;
  eyebrow: string;
  title: string;
  description: string;
  readTimeLabel: (minutes: number) => string;
  readArticleLabel: string;
  viewAllLabel: string;
  fallbackTitle: string;
  fallbackExcerpt: string;
  fallbackBadgeLabel: string;
}) {
  if (posts.length === 0) {
    return null;
  }

  return (
    <section className="border-t border-white/10 bg-[linear-gradient(180deg,rgba(7,13,24,0.96),rgba(6,11,20,0.98))] py-20">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-700 uppercase tracking-[0.28em] text-cyan-200/80">{eyebrow}</p>
            <h2 className="mt-3 text-3xl font-800 tracking-tight text-white sm:text-4xl">{title}</h2>
            <p className="mt-3 text-base leading-7 text-slate-300">{description}</p>
          </div>
          <Link
            href="/blog"
            className="inline-flex h-11 items-center justify-center rounded-full border border-cyan-300/30 px-5 text-sm font-700 text-cyan-100 transition-colors hover:border-cyan-200/60 hover:bg-cyan-300/10"
          >
            {viewAllLabel}
          </Link>
        </div>

        <div className="relative">
          {posts.length > 3 ? (
            <>
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-12 bg-gradient-to-r from-[#071323] to-transparent lg:block" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-20 bg-gradient-to-l from-[#071323] via-[#071323]/90 to-transparent lg:block" />
            </>
          ) : null}
          <div className="overflow-x-auto pb-4 [scrollbar-color:rgba(103,232,249,0.35)_transparent] [scrollbar-width:thin]">
            <div className="flex min-w-full snap-x snap-mandatory gap-5 pr-6">
              {posts.map((post) => (
                <div
                  key={post.slug}
                  className="min-w-0 shrink-0 snap-start basis-[84vw] sm:basis-[420px] lg:basis-[calc((100%-2.5rem)/3)]"
                >
                  <BlogCard
                    post={post}
                    locale={locale}
                    readTimeLabel={readTimeLabel}
                    readArticleLabel={readArticleLabel}
                    fallbackTitle={fallbackTitle}
                    fallbackExcerpt={fallbackExcerpt}
                    fallbackBadgeLabel={fallbackBadgeLabel}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
