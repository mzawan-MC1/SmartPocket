import type { MetadataRoute } from 'next';
import { listPublicCmsPages } from '@/lib/cms-pages-server';
import { isReservedCmsSlug } from '@/lib/cms-pages';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { buildAbsoluteSiteUrl } from '@/lib/site-metadata';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await getPlatformSettingsSnapshot();
  const pages = await listPublicCmsPages();
  const lastModified = settings.updatedAt ? new Date(settings.updatedAt) : new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    '/home',
    '/about',
    '/features',
    '/pricing',
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
    .filter((page) => !isReservedCmsSlug(page.slug))
    .map((page) => ({
      url: buildAbsoluteSiteUrl(`/${page.slug}`, settings),
      lastModified: new Date(page.updated_at || page.published_at || lastModified),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }));

  return [...staticRoutes, ...cmsRoutes];
}
