import type { Metadata } from 'next';
import { listFeaturedBlogPosts } from '@/lib/cms-pages-server';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { buildPageMetadata, resolveMetadataLanguage } from '@/lib/site-metadata';
import HomePageClient from './(public)/home/HomePageClient';
import PublicLayout from './(public)/layout';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettingsSnapshot();
  const language = await resolveMetadataLanguage(settings);

  return buildPageMetadata({
    settings,
    language,
    pathname: '/',
    canonicalPath: '/',
    title: settings.seo.home.title,
    description: settings.seo.home.description,
    keywords:
      settings.seo.home.keywords.length > 0 ? settings.seo.home.keywords : settings.seo.keywords,
    openGraphTitle: settings.seo.home.ogTitle,
    openGraphDescription: settings.seo.home.ogDescription,
    twitterTitle: settings.seo.home.twitterTitle,
    twitterDescription: settings.seo.home.twitterDescription,
    socialImageUrl: settings.seo.home.socialImage,
    twitterImageUrl: settings.seo.home.twitterImage,
    index: settings.seo.home.robotsIndex,
    follow: settings.seo.home.robotsFollow,
  });
}

export default async function RootPage() {
  const featuredBlogPosts = await listFeaturedBlogPosts();

  return (
    <PublicLayout>
      <HomePageClient
        featuredBlogPosts={featuredBlogPosts.map((post) => ({
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
        }))}
      />
    </PublicLayout>
  );
}
