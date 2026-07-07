import type { MetadataRoute } from 'next';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { getCanonicalOrigin } from '@/lib/site-metadata';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await getPlatformSettingsSnapshot();
  const origin = getCanonicalOrigin(settings);

  return {
    rules: [
      {
        userAgent: '*',
        allow: settings.seo.robotsIndex
          ? [
              '/',
              '/ai-receipt-scanner',
              '/ai-voice-expense-tracker',
              '/family-budget-app',
              '/shared-expenses',
              '/multi-currency-expense-tracker',
              '/expense-tracker-uae',
              '/faqs',
              '/contact',
              '/privacy',
              '/terms',
            ]
          : [],
        disallow: [
          '/admin',
          '/admin/*',
          '/dashboard',
          '/transactions',
          '/financial-accounts',
          '/transfers',
          '/budgets',
          '/recurring',
          '/categories',
          '/reimbursements',
          '/settlements',
          '/people',
          '/spaces',
          '/reports',
          '/reports/*',
          '/ai-history',
          '/settings',
          '/settings/*',
          '/sign-up-login',
          '/auth',
          '/auth/*',
          '/invite',
          '/invite/*',
          '/onboarding',
          '/api',
          '/api/*',
        ],
      },
    ],
    sitemap: settings.seo.sitemapEnabled ? `${origin}/sitemap.xml` : undefined,
    host: origin,
  };
}
