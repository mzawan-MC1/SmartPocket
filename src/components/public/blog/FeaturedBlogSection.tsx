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
}: {
  posts: BlogCardData[];
  locale: string;
  eyebrow: string;
  title: string;
  description: string;
  readTimeLabel: (minutes: number) => string;
  readArticleLabel: string;
  viewAllLabel: string;
}) {
  if (posts.length === 0) {
    return null;
  }

  const primaryPosts = posts.slice(0, 3);
  const overflowPosts = posts.slice(3);

  return (
    <section className="border-t border-white/10 bg-[linear-gradient(180deg,rgba(7,13,24,0.96),rgba(6,11,20,0.98))] py-20">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-700 uppercase tracking-[0.28em] text-cyan-200/80">{eyebrow}</p>
            <h2 className="mt-3 text-3xl font-800 tracking-tight text-white sm:text-4xl">{title}</h2>
            <p className="mt-3 text-base leading-7 text-slate-300">{description}</p>
          </div>
          <a
            href="/blog"
            className="inline-flex h-11 items-center justify-center rounded-full border border-cyan-300/30 px-5 text-sm font-700 text-cyan-100 transition-colors hover:border-cyan-200/60 hover:bg-cyan-300/10"
          >
            {viewAllLabel}
          </a>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {primaryPosts.map((post) => (
            <BlogCard
              key={post.slug}
              post={post}
              locale={locale}
              readTimeLabel={readTimeLabel}
              readArticleLabel={readArticleLabel}
            />
          ))}
        </div>

        {overflowPosts.length > 0 ? (
          <div className="mt-6 overflow-x-auto pb-2">
            <div className="flex min-w-full gap-4">
              {overflowPosts.map((post) => (
                <div key={post.slug} className="w-[320px] min-w-[320px]">
                  <BlogCard
                    post={post}
                    locale={locale}
                    readTimeLabel={readTimeLabel}
                    readArticleLabel={readArticleLabel}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
