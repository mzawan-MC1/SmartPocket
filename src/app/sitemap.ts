import type { MetadataRoute } from 'next';
import { listPublicCmsPages } from '@/lib/cms-pages-server';
import { isSitemapExcludedCmsSlug } from '@/lib/cms-pages';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { buildAbsoluteSiteUrl } from '@/lib/site-metadata';

function normalizeSitemapUrl(url: string) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/g, '') || '/';
    return `${parsed.origin.toLowerCase()}${pathname}`;
  } catch {
    return url.toLowerCase();
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await getPlatformSettingsSnapshot();
  const pages = await listPublicCmsPages();
  const lastModified = settings.updatedAt ? new Date(settings.updatedAt) : new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    '/home',
    '/contact',
    '/privacy',
    '/terms',
  ].map((path) => ({
    url: buildAbsoluteSiteUrl(path, settings),
    lastModified,
    changeFrequency: path === '/home' ? 'weekly' : 'monthly',
    priority: path === '/home' ? 1 : 0.7,
  }));

  const cmsRoutes: MetadataRoute.Sitemap = pages
    .filter((page) => !isSitemapExcludedCmsSlug(page.slug))
    .map((page) => ({
      url: buildAbsoluteSiteUrl(`/${page.slug}`, settings),
      lastModified: new Date(page.updated_at || page.published_at || lastModified),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }));

  const deduped = new Map<string, MetadataRoute.Sitemap[number]>();
  for (const entry of [...staticRoutes, ...cmsRoutes]) {
    const key = normalizeSitemapUrl(entry.url);
    if (!deduped.has(key)) {
      deduped.set(key, entry);
    }
  }

  return Array.from(deduped.values());
}
