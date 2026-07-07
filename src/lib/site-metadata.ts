import 'server-only';

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { SupportedLanguage } from '@/i18n/resources';
import { resolveInitialI18nState } from '@/i18n/server';
import {
  DEFAULT_PLATFORM_SETTINGS,
  PRODUCTION_CANONICAL_ORIGIN,
  getApprovedSocialPreviewAsset,
  getSettingsAssetUrl,
  isDisallowedSocialPreviewAsset,
  type PlatformSettingsSnapshot,
} from '@/lib/platform-settings';
import { getPlatformBillingCurrencyCode } from '@/lib/subscription/billing-currency';
import { loadActivePublicPlans } from '@/lib/subscription/server';

const PRIVATE_PATH_PREFIXES = [
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
  '/ai-history',
  '/billing',
  '/help',
  '/settings',
  '/admin',
  '/invite',
  '/onboarding',
];

const PRIVATE_EXACT_PATHS = new Set([
  '/sign-up-login',
  '/auth/reset-password',
]);

const OG_LOCALE_BY_LANGUAGE: Record<SupportedLanguage, string> = {
  en: 'en_US',
  ar: 'ar_AR',
  fr: 'fr_FR',
  ru: 'ru_RU',
};

export type StructuredDataValue = Record<string, unknown>;

type PageMetadataOptions = {
  settings: PlatformSettingsSnapshot;
  language: SupportedLanguage;
  title?: string;
  description?: string;
  keywords?: string[] | null;
  openGraphTitle?: string;
  openGraphDescription?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImageUrl?: string;
  pathname?: string;
  canonicalPath?: string;
  canonicalUrl?: string;
  socialImageUrl?: string;
  socialImageAlt?: string;
  openGraphType?: 'website' | 'article';
  index?: boolean;
  follow?: boolean;
  noIndex?: boolean;
};

const EMERGENCY_PAGE_METADATA_FALLBACKS: Record<
  string,
  { title: string; description: string; keywords?: string[] }
> = {
  '/home': {
    title: DEFAULT_PLATFORM_SETTINGS.seo.siteTitle,
    description: DEFAULT_PLATFORM_SETTINGS.seo.siteDescription,
    keywords: DEFAULT_PLATFORM_SETTINGS.seo.keywords,
  },
  '/contact': {
    title: 'Contact Smart Pocket',
    description: 'Contact Smart Pocket for support, privacy, or general inquiries.',
  },
  '/privacy': {
    title: 'Privacy Policy',
    description: 'Read how Smart Pocket handles your personal and financial information.',
  },
  '/terms': {
    title: 'Terms of Service',
    description: 'Read the terms that govern the use of Smart Pocket.',
  },
};

function normalizeOrigin(url: string) {
  const trimmed = url.trim();
  if (!trimmed) {
    return PRODUCTION_CANONICAL_ORIGIN;
  }

  try {
    const parsed = new URL(trimmed);
    return `https://${parsed.hostname.replace(/^www\./i, '')}`;
  } catch {
    return PRODUCTION_CANONICAL_ORIGIN;
  }
}

function normalizePathname(pathname?: string) {
  if (!pathname || pathname === '/') {
    return '/';
  }

  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return normalized.replace(/\/{2,}/g, '/').replace(/\/+$/g, '') || '/';
}

export function getCanonicalOrigin(settings: PlatformSettingsSnapshot) {
  return normalizeOrigin(settings.seo.canonicalUrl || PRODUCTION_CANONICAL_ORIGIN);
}

export function getMetadataBaseUrl(settings: PlatformSettingsSnapshot) {
  return new URL(getCanonicalOrigin(settings));
}

export function buildAbsoluteSiteUrl(pathname: string, settings: PlatformSettingsSnapshot) {
  return new URL(normalizePathname(pathname), getMetadataBaseUrl(settings)).toString();
}

function buildAbsoluteOrRelativeSiteUrl(value: string, settings: PlatformSettingsSnapshot) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const absolute = new URL(trimmed, getMetadataBaseUrl(settings));
    if (absolute.protocol === 'http:') {
      absolute.protocol = 'https:';
    }
    return absolute.toString();
  } catch {
    return '';
  }
}

export function buildAbsoluteAssetUrl(
  assetUrl: string,
  settings: PlatformSettingsSnapshot,
  options?: {
    includeVersion?: boolean;
  }
) {
  const resolved =
    options?.includeVersion === false
      ? assetUrl
      : getSettingsAssetUrl(assetUrl, settings.updatedAt);
  if (!resolved) {
    return '';
  }

  try {
    const absoluteUrl = new URL(resolved, getMetadataBaseUrl(settings));
    if (absoluteUrl.protocol === 'http:') {
      absoluteUrl.protocol = 'https:';
    }
    return absoluteUrl.toString();
  } catch {
    return resolved;
  }
}

export function isPrivateMetadataPath(pathname: string) {
  const normalized = normalizePathname(pathname);
  if (PRIVATE_EXACT_PATHS.has(normalized)) {
    return true;
  }

  return PRIVATE_PATH_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

async function getRequestPathname() {
  const requestHeaders = await headers();
  return normalizePathname(requestHeaders.get('x-sp-pathname') || '/');
}

export async function resolveMetadataLanguage(settings: PlatformSettingsSnapshot) {
  const state = await resolveInitialI18nState(settings);
  return state.language;
}

export function getEmergencyPageMetadataFallback(pathname: string) {
  const normalized = normalizePathname(pathname);
  return EMERGENCY_PAGE_METADATA_FALLBACKS[normalized] || EMERGENCY_PAGE_METADATA_FALLBACKS['/home'];
}

function buildVerification(settings: PlatformSettingsSnapshot): Metadata['verification'] {
  const google = settings.seo.googleSiteVerification || undefined;
  const bing = settings.seo.bingSiteVerification || undefined;

  if (!google && !bing) {
    return undefined;
  }

  return {
    google,
    other: bing ? { 'msvalidate.01': bing } : undefined,
  };
}

function buildSocialImage(
  settings: PlatformSettingsSnapshot,
  socialImageUrl?: string,
  socialImageAlt?: string
) {
  const blockedSources = [
    settings.branding.logoUrl,
    settings.branding.compactLogoUrl,
    settings.branding.faviconUrl,
    settings.branding.appleTouchIconUrl,
    settings.branding.pwaIcon192Url,
    settings.branding.pwaIcon512Url,
  ];
  const candidate =
    getApprovedSocialPreviewAsset(socialImageUrl || '', blockedSources) ||
    getApprovedSocialPreviewAsset(settings.seo.ogImage || '', blockedSources) ||
    getApprovedSocialPreviewAsset(DEFAULT_PLATFORM_SETTINGS.seo.ogImage || '', blockedSources);
  const url = buildAbsoluteAssetUrl(candidate, settings, { includeVersion: false });

  if (!url) {
    return undefined;
  }

  return {
    url,
    width: 1200,
    height: 630,
    alt: socialImageAlt || `${settings.branding.appName} social preview`,
  };
}

export async function buildRootMetadata(settings: PlatformSettingsSnapshot): Promise<Metadata> {
  const pathname = await getRequestPathname();
  const language = await resolveMetadataLanguage(settings);
  const noIndex = isPrivateMetadataPath(pathname) || !settings.seo.robotsIndex;
  const siteUrl = getCanonicalOrigin(settings);
  const socialImage = buildSocialImage(settings, settings.seo.ogImage, `${settings.branding.appName} preview`);
  const blockedSources = [
    settings.branding.logoUrl,
    settings.branding.compactLogoUrl,
    settings.branding.faviconUrl,
    settings.branding.appleTouchIconUrl,
    settings.branding.pwaIcon192Url,
    settings.branding.pwaIcon512Url,
  ];
  const twitterImage = buildAbsoluteAssetUrl(
    getApprovedSocialPreviewAsset(settings.seo.twitterImage || '', blockedSources) ||
      getApprovedSocialPreviewAsset(settings.seo.ogImage || '', blockedSources) ||
      getApprovedSocialPreviewAsset(DEFAULT_PLATFORM_SETTINGS.seo.ogImage || '', blockedSources),
    settings,
    { includeVersion: false }
  );
  const favicon = getSettingsAssetUrl(settings.branding.faviconUrl, settings.updatedAt);
  const appleTouchIcon = getSettingsAssetUrl(settings.branding.appleTouchIconUrl, settings.updatedAt);

  return {
    metadataBase: getMetadataBaseUrl(settings),
    applicationName: settings.branding.appName,
    title: {
      default: settings.seo.siteTitle,
      template: settings.seo.titleTemplate,
    },
    description: settings.seo.siteDescription,
    keywords: settings.seo.keywords.length > 0 ? settings.seo.keywords : undefined,
    alternates: {
      canonical: siteUrl,
    },
    icons: {
      icon: favicon ? [{ url: favicon }] : undefined,
      shortcut: favicon ? [{ url: favicon }] : undefined,
      apple: appleTouchIcon ? [{ url: appleTouchIcon }] : undefined,
    },
    verification: buildVerification(settings),
    openGraph: {
      type: 'website',
      url: siteUrl,
      siteName: settings.branding.appName,
      locale: OG_LOCALE_BY_LANGUAGE[language],
      alternateLocale: settings.localization.enabledLanguages
        .filter((entry) => entry !== language)
        .map((entry) => OG_LOCALE_BY_LANGUAGE[entry]),
      title: settings.seo.ogTitle,
      description: settings.seo.ogDescription,
      images: socialImage ? [socialImage] : undefined,
    },
    twitter: {
      card: settings.seo.twitterCard,
      site: settings.seo.twitterHandle || undefined,
      creator: settings.seo.twitterHandle || undefined,
      title: settings.seo.twitterTitle,
      description: settings.seo.twitterDescription,
      images: twitterImage ? [twitterImage] : socialImage ? [socialImage.url] : undefined,
    },
    robots: {
      index: !noIndex,
      follow: !noIndex && settings.seo.robotsFollow,
      googleBot: {
        index: !noIndex,
        follow: !noIndex && settings.seo.robotsFollow,
      },
    },
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: settings.branding.shortBrandName || settings.branding.appName,
    },
    formatDetection: {
      telephone: false,
    },
  };
}

export function buildPageMetadata({
  settings,
  language,
  title,
  description,
  keywords,
  openGraphTitle,
  openGraphDescription,
  twitterTitle,
  twitterDescription,
  twitterImageUrl,
  pathname = '/',
  canonicalPath,
  canonicalUrl,
  socialImageUrl,
  socialImageAlt,
  openGraphType = 'website',
  index,
  follow,
  noIndex = false,
}: PageMetadataOptions): Metadata {
  const normalizedPath = normalizePathname(canonicalPath || pathname);
  const resolvedCanonicalUrl =
    buildAbsoluteOrRelativeSiteUrl(canonicalUrl || '', settings) ||
    buildAbsoluteSiteUrl(normalizedPath, settings);
  const resolvedTitle = title || settings.seo.siteTitle;
  const resolvedDescription = description || settings.seo.siteDescription;
  const resolvedKeywords = keywords === undefined ? settings.seo.keywords : keywords;
  const resolvedOpenGraphTitle = openGraphTitle || resolvedTitle;
  const resolvedOpenGraphDescription = openGraphDescription || resolvedDescription;
  const resolvedTwitterTitle = twitterTitle || resolvedOpenGraphTitle;
  const resolvedTwitterDescription = twitterDescription || resolvedOpenGraphDescription;
  const socialImage = buildSocialImage(settings, socialImageUrl, socialImageAlt || `${resolvedTitle} preview`);
  const blockedSources = [
    settings.branding.logoUrl,
    settings.branding.compactLogoUrl,
    settings.branding.faviconUrl,
    settings.branding.appleTouchIconUrl,
    settings.branding.pwaIcon192Url,
    settings.branding.pwaIcon512Url,
  ];
  const twitterImage = buildAbsoluteAssetUrl(
    getApprovedSocialPreviewAsset(twitterImageUrl || '', blockedSources) ||
      getApprovedSocialPreviewAsset(socialImageUrl || '', blockedSources) ||
      getApprovedSocialPreviewAsset(settings.seo.twitterImage || '', blockedSources) ||
      getApprovedSocialPreviewAsset(settings.seo.ogImage || '', blockedSources) ||
      getApprovedSocialPreviewAsset(DEFAULT_PLATFORM_SETTINGS.seo.ogImage || '', blockedSources),
    settings,
    { includeVersion: false }
  );
  const shouldIndex = !noIndex && (index ?? settings.seo.robotsIndex);
  const shouldFollow = !noIndex && (follow ?? settings.seo.robotsFollow);

  return {
    title: resolvedTitle,
    description: resolvedDescription,
    keywords: resolvedKeywords && resolvedKeywords.length > 0 ? resolvedKeywords : undefined,
    alternates: {
      canonical: resolvedCanonicalUrl,
    },
    openGraph: {
      type: openGraphType,
      url: resolvedCanonicalUrl,
      siteName: settings.branding.appName,
      locale: OG_LOCALE_BY_LANGUAGE[language],
      alternateLocale: settings.localization.enabledLanguages
        .filter((entry) => entry !== language)
        .map((entry) => OG_LOCALE_BY_LANGUAGE[entry]),
      title: resolvedOpenGraphTitle,
      description: resolvedOpenGraphDescription,
      images: socialImage ? [socialImage] : undefined,
    },
    twitter: {
      card: settings.seo.twitterCard,
      site: settings.seo.twitterHandle || undefined,
      creator: settings.seo.twitterHandle || undefined,
      title: resolvedTwitterTitle,
      description: resolvedTwitterDescription,
      images: twitterImage ? [twitterImage] : socialImage ? [socialImage.url] : undefined,
    },
    robots: {
      index: shouldIndex,
      follow: shouldFollow,
      googleBot: {
        index: shouldIndex,
        follow: shouldFollow,
      },
    },
  };
}

export function buildOrganizationStructuredData(settings: PlatformSettingsSnapshot): StructuredDataValue {
  const sameAs = [
    settings.publicUi.socialTwitter,
    settings.publicUi.socialLinkedin,
    settings.publicUi.socialGithub,
  ].filter(Boolean);

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: settings.seo.organizationName || settings.branding.appName,
    legalName: settings.seo.organizationLegalName || undefined,
    description: settings.seo.organizationDescription || settings.seo.siteDescription,
    url: getCanonicalOrigin(settings),
    logo: buildAbsoluteAssetUrl(settings.branding.organizationLogoUrl, settings),
    contactPoint:
      settings.publicUi.contactEmail || settings.publicUi.contactPhone
        ? [
            {
              '@type': 'ContactPoint',
              email: settings.publicUi.contactEmail || undefined,
              telephone: settings.publicUi.contactPhone || undefined,
              contactType: 'customer support',
              availableLanguage: settings.localization.enabledLanguages,
            },
          ]
        : undefined,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
  };
}

export function buildWebsiteStructuredData(
  settings: PlatformSettingsSnapshot,
  language: SupportedLanguage
): StructuredDataValue {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: settings.branding.appName,
    url: getCanonicalOrigin(settings),
    inLanguage: language,
  };
}

export async function buildSoftwareApplicationStructuredData(
  settings: PlatformSettingsSnapshot
): Promise<StructuredDataValue> {
  const plans = await loadActivePublicPlans();
  const offers = plans
    .filter((plan) => plan.isActive && plan.planCode !== 'free_trial')
    .map((plan) => ({
      '@type': 'Offer',
      name: `${plan.planName} (${plan.billingInterval})`,
      price: plan.priceAmount,
      priceCurrency: getPlatformBillingCurrencyCode(plan.currencyCode),
      availability: 'https://schema.org/InStock',
      url: buildAbsoluteSiteUrl('/#pricing', settings),
      category: plan.billingInterval,
    }));

  const freeTrialDays = plans.find((plan) => plan.planCode === 'free_trial')?.trialDurationDays || 0;

  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: settings.branding.appName,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web, PWA',
    url: getCanonicalOrigin(settings),
    image: buildAbsoluteAssetUrl(
      isDisallowedSocialPreviewAsset(settings.seo.ogImage, [
        settings.branding.logoUrl,
        settings.branding.compactLogoUrl,
        settings.branding.faviconUrl,
        settings.branding.appleTouchIconUrl,
        settings.branding.pwaIcon192Url,
        settings.branding.pwaIcon512Url,
      ])
        ? ''
        : settings.seo.ogImage,
      settings,
      { includeVersion: false }
    ),
    description: settings.seo.siteDescription,
    offers: offers.length > 0 ? offers : undefined,
    featureList: [
      'Budget tracking',
      'Expense and income management',
      'Financial reporting',
      'Multi-currency support',
      'Progressive Web App access',
    ],
    isAccessibleForFree: freeTrialDays > 0,
    termsOfService: buildAbsoluteSiteUrl('/terms', settings),
    privacyPolicy: buildAbsoluteSiteUrl('/privacy', settings),
  };
}

export function buildBreadcrumbStructuredData(
  settings: PlatformSettingsSnapshot,
  items: Array<{ name: string; path: string }>
): StructuredDataValue {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: buildAbsoluteSiteUrl(item.path, settings),
    })),
  };
}

export function buildArticleStructuredData({
  settings,
  title,
  description,
  pathname,
  imageUrl,
  publishedAt,
  updatedAt,
  authorName,
  language,
}: {
  settings: PlatformSettingsSnapshot;
  title: string;
  description: string;
  pathname: string;
  imageUrl?: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
  authorName?: string | null;
  language: SupportedLanguage;
}): StructuredDataValue {
  const blockedSources = [
    settings.branding.logoUrl,
    settings.branding.compactLogoUrl,
    settings.branding.faviconUrl,
    settings.branding.appleTouchIconUrl,
    settings.branding.pwaIcon192Url,
    settings.branding.pwaIcon512Url,
  ];
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    url: buildAbsoluteSiteUrl(pathname, settings),
    image: buildAbsoluteAssetUrl(
      getApprovedSocialPreviewAsset(imageUrl || '', blockedSources) ||
        getApprovedSocialPreviewAsset(settings.seo.ogImage || '', blockedSources) ||
        getApprovedSocialPreviewAsset(DEFAULT_PLATFORM_SETTINGS.seo.ogImage || '', blockedSources),
      settings,
      { includeVersion: false }
    ),
    inLanguage: language,
    datePublished: publishedAt || undefined,
    dateModified: updatedAt || publishedAt || undefined,
    author: authorName
      ? {
          '@type': 'Person',
          name: authorName,
        }
      : {
          '@type': 'Organization',
          name: settings.seo.organizationName || settings.branding.appName,
        },
    publisher: {
      '@type': 'Organization',
      name: settings.seo.organizationName || settings.branding.appName,
      logo: {
        '@type': 'ImageObject',
        url: buildAbsoluteAssetUrl(settings.branding.organizationLogoUrl, settings),
      },
    },
  };
}

export async function buildDefaultStructuredData(
  settings: PlatformSettingsSnapshot
): Promise<StructuredDataValue[]> {
  const language = await resolveMetadataLanguage(settings);
  return [
    buildOrganizationStructuredData(settings),
    buildWebsiteStructuredData(settings, language),
    await buildSoftwareApplicationStructuredData(settings),
  ];
}

export function getFallbackMetadata(settings?: PlatformSettingsSnapshot) {
  return settings || DEFAULT_PLATFORM_SETTINGS;
}
