import type { CSSProperties } from 'react';

export type PlatformLanguage = 'en' | 'ar' | 'fr' | 'ru';
export type PlatformFontFamily = 'Plus Jakarta Sans' | 'Inter' | 'Poppins' | 'Roboto';

export interface PlatformNavLink {
  id: string;
  label: string;
  href: string;
}

export interface PlatformFooterSection {
  id: string;
  title: string;
  links: PlatformNavLink[];
}

export interface PlatformBrandingSettings {
  appName: string;
  shortBrandName: string;
  tagline: string;
  logoUrl: string;
  compactLogoUrl: string;
  faviconUrl: string;
  appleTouchIconUrl: string;
  pwaIcon192Url: string;
  pwaIcon512Url: string;
  socialImageUrl: string;
  emailLogoUrl: string;
  organizationLogoUrl: string;
  primaryColor: string;
  accentColor: string;
  fontFamily: PlatformFontFamily;
}

export interface PlatformSeoSettings {
  siteTitle: string;
  titleTemplate: string;
  siteDescription: string;
  keywords: string[];
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;
  twitterHandle: string;
  twitterCard: 'summary' | 'summary_large_image';
  robotsIndex: boolean;
  robotsFollow: boolean;
  sitemapEnabled: boolean;
  googleSiteVerification: string;
  bingSiteVerification: string;
  organizationName: string;
  organizationLegalName: string;
  organizationDescription: string;
}

export interface PlatformPublicSettings {
  headerMenu: PlatformNavLink[];
  stickyHeader: boolean;
  footerSections: PlatformFooterSection[];
  footerTagline: string;
  footerCompanyName: string;
  footerWebsiteUrl: string;
  footerCopyright: string;
  contactEmail: string;
  contactPhone: string;
  contactPhoneCountryCode: string;
  contactPhoneFormatted: string;
  contactAddress: string;
  socialTwitter: string;
  socialGithub: string;
  socialLinkedin: string;
}

export interface PlatformEmailSettings {
  provider: 'supabase' | 'smtp';
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  supportEmail: string;
  emailLogoUrl: string;
  footerCompanyName: string;
  footerWebsiteUrl: string;
  footerCopyright: string;
  testRecipientEmail: string;
}

export interface PlatformAnalyticsSettings {
  googleAnalyticsId: string;
  googleTagManagerId: string;
}

export interface PlatformAuthSettings {
  emailPasswordEnabled: boolean;
  googleOauthEnabled: boolean;
  appleOauthEnabled: boolean;
  magicLinkEnabled: boolean;
  requireEmailVerification: boolean;
  passwordMinLength: number;
}

export interface PlatformLocalizationSettings {
  defaultLanguage: PlatformLanguage;
  enabledLanguages: PlatformLanguage[];
}

export interface PlatformSettingsSnapshot {
  branding: PlatformBrandingSettings;
  seo: PlatformSeoSettings;
  publicUi: PlatformPublicSettings;
  email: PlatformEmailSettings;
  analytics: PlatformAnalyticsSettings;
  auth: PlatformAuthSettings;
  localization: PlatformLocalizationSettings;
  updatedAt?: string;
  raw: Record<string, unknown>;
}

export const PRODUCTION_CANONICAL_ORIGIN = 'https://1smartpocket.com';
export const SMART_POCKET_DEFAULT_LOGO = '/assets/images/app_logo.png';
export const SMART_POCKET_DEFAULT_COMPACT_LOGO = '/assets/images/smart-pocket-mark.svg';
export const SMART_POCKET_DEFAULT_SOCIAL_IMAGE = '/assets/images/smart-pocket-social-card.png';
export const SMART_POCKET_LEGACY_SOCIAL_IMAGE_SVG = '/assets/images/smart-pocket-social-card.svg';
export const SMART_POCKET_DEFAULT_ICON = '/assets/images/smart-pocket-icon.svg';
export const SMART_POCKET_DEFAULT_FAVICON = '/favicon.ico';
export const SMART_POCKET_SAFE_FALLBACK_IMAGE = '/assets/images/no_image.png';
export const SMART_POCKET_LEGACY_WALLET_IMAGE = SMART_POCKET_DEFAULT_LOGO;

const LEGACY_MARKETING_ANCHORS = {
  '/#about': '/about',
  '/#features': '/features',
  '/#pricing': '/pricing',
  '/#contact': '/contact',
} as const;

function normalizePublicDestination(href: string) {
  const trimmed = href.trim();
  if (!trimmed) {
    return '';
  }

  const [pathPart, hashPart] = trimmed.split('#', 2);
  const normalizedPath = pathPart
    ? (pathPart.startsWith('/') ? pathPart : `/${pathPart}`)
        .replace(/\/{2,}/g, '/')
        .replace(/\/+$/g, '') || '/'
    : '/';
  const normalizedHash = hashPart ? `#${hashPart.trim().toLowerCase()}` : '';
  return `${normalizedPath}${normalizedHash}`;
}

export function mapMarketingHrefToHomeAnchor(href: string) {
  const normalized = normalizePublicDestination(href);
  if (!normalized) {
    return normalized;
  }

  return LEGACY_MARKETING_ANCHORS[normalized as keyof typeof LEGACY_MARKETING_ANCHORS] || normalized;
}

export function normalizePublicNavHref(href: string) {
  return mapMarketingHrefToHomeAnchor(href);
}

export const DEFAULT_HEADER_MENU: PlatformNavLink[] = [
  { id: 'hm-about', label: 'About', href: '/about' },
  { id: 'hm-features', label: 'Features', href: '/features' },
  { id: 'hm-pricing', label: 'Pricing', href: '/pricing' },
  { id: 'hm-contact', label: 'Contact', href: '/contact' },
];

export const DEFAULT_FOOTER_SECTIONS: PlatformFooterSection[] = [
  {
    id: 'fs-product',
    title: 'Product',
    links: [
      { id: 'fl-features', label: 'Features', href: '/features' },
      { id: 'fl-pricing', label: 'Pricing', href: '/pricing' },
      { id: 'fl-about', label: 'About', href: '/about' },
    ],
  },
  {
    id: 'fs-support',
    title: 'Support',
    links: [
      { id: 'fl-contact', label: 'Contact', href: '/contact' },
      { id: 'fl-help', label: 'Help Center', href: '/help' },
    ],
  },
  {
    id: 'fs-legal',
    title: 'Legal',
    links: [
      { id: 'fl-privacy', label: 'Privacy Policy', href: '/privacy' },
      { id: 'fl-terms', label: 'Terms of Service', href: '/terms' },
    ],
  },
];

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettingsSnapshot = {
  branding: {
    appName: 'Smart Pocket',
    shortBrandName: 'Smart Pocket',
    tagline: 'Personal Finance, Simplified',
    logoUrl: SMART_POCKET_DEFAULT_LOGO,
    compactLogoUrl: SMART_POCKET_DEFAULT_COMPACT_LOGO,
    faviconUrl: SMART_POCKET_DEFAULT_FAVICON,
    appleTouchIconUrl: SMART_POCKET_DEFAULT_ICON,
    pwaIcon192Url: SMART_POCKET_DEFAULT_ICON,
    pwaIcon512Url: SMART_POCKET_DEFAULT_ICON,
    socialImageUrl: SMART_POCKET_DEFAULT_SOCIAL_IMAGE,
    emailLogoUrl: SMART_POCKET_DEFAULT_LOGO,
    organizationLogoUrl: SMART_POCKET_DEFAULT_LOGO,
    primaryColor: '#0f3460',
    accentColor: '#00b4d8',
    fontFamily: 'Plus Jakarta Sans',
  },
  seo: {
    siteTitle: 'Smart Pocket — Personal Finance, Simplified',
    titleTemplate: '%s | Smart Pocket',
    siteDescription: 'Smart Pocket helps you track income, expenses, budgets, and financial accounts with professional reporting and a clean mobile-first interface.',
    keywords: ['personal finance', 'budgeting', 'expense tracking', 'money management'],
    canonicalUrl: PRODUCTION_CANONICAL_ORIGIN,
    ogTitle: 'Smart Pocket — Personal Finance, Simplified',
    ogDescription: 'Smart Pocket helps you track income, expenses, budgets, and financial accounts with professional reporting and a clean mobile-first interface.',
    ogImage: SMART_POCKET_DEFAULT_SOCIAL_IMAGE,
    twitterTitle: 'Smart Pocket — Personal Finance, Simplified',
    twitterDescription: 'Smart Pocket helps you track income, expenses, budgets, and financial accounts with professional reporting and a clean mobile-first interface.',
    twitterImage: SMART_POCKET_DEFAULT_SOCIAL_IMAGE,
    twitterHandle: '@smartpocket',
    twitterCard: 'summary_large_image',
    robotsIndex: true,
    robotsFollow: true,
    sitemapEnabled: true,
    googleSiteVerification: '',
    bingSiteVerification: '',
    organizationName: 'Smart Pocket',
    organizationLegalName: '',
    organizationDescription: 'Smart Pocket helps you track income, expenses, budgets, and financial accounts with professional reporting and a clean mobile-first interface.',
  },
  publicUi: {
    headerMenu: DEFAULT_HEADER_MENU,
    stickyHeader: true,
    footerSections: DEFAULT_FOOTER_SECTIONS,
    footerTagline: 'Personal finance, simplified.',
    footerCompanyName: 'Smart Pocket',
    footerWebsiteUrl: PRODUCTION_CANONICAL_ORIGIN,
    footerCopyright: '© Smart Pocket. All rights reserved.',
    contactEmail: '',
    contactPhone: '',
    contactPhoneCountryCode: '',
    contactPhoneFormatted: '',
    contactAddress: '',
    socialTwitter: '',
    socialGithub: '',
    socialLinkedin: '',
  },
  email: {
    provider: 'supabase',
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    fromEmail: 'no-reply@1smartpocket.com',
    fromName: 'Smart Pocket',
    replyToEmail: 'info@1smartpocket.com',
    supportEmail: 'info@1smartpocket.com',
    emailLogoUrl: SMART_POCKET_DEFAULT_LOGO,
    footerCompanyName: 'Smart Pocket',
    footerWebsiteUrl: PRODUCTION_CANONICAL_ORIGIN,
    footerCopyright: '© Smart Pocket. All rights reserved.',
    testRecipientEmail: '',
  },
  analytics: {
    googleAnalyticsId: '',
    googleTagManagerId: '',
  },
  auth: {
    emailPasswordEnabled: true,
    googleOauthEnabled: false,
    appleOauthEnabled: false,
    magicLinkEnabled: false,
    requireEmailVerification: true,
    passwordMinLength: 8,
  },
  localization: {
    defaultLanguage: 'en',
    enabledLanguages: ['en', 'ar', 'fr', 'ru'],
  },
  updatedAt: undefined,
  raw: {},
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizeHexColor(value: unknown, fallback: string) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return /^#([0-9a-fA-F]{6})$/.test(normalized) ? normalized : fallback;
}

function sanitizeFontFamily(value: unknown): PlatformBrandingSettings['fontFamily'] {
  switch (value) {
    case 'Inter':
    case 'Poppins':
    case 'Roboto':
      return value;
    default:
      return 'Plus Jakarta Sans';
  }
}

function sanitizeNonEmptyString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function sanitizeOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAssetIdentity(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = new URL(trimmed, PRODUCTION_CANONICAL_ORIGIN);
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

export function isDisallowedSocialPreviewAsset(value: string, blockedSources: string[] = []) {
  const normalized = normalizeAssetIdentity(value);
  if (!normalized) {
    return false;
  }

  const reservedAssets = [
    SMART_POCKET_LEGACY_WALLET_IMAGE,
    SMART_POCKET_LEGACY_SOCIAL_IMAGE_SVG,
    SMART_POCKET_DEFAULT_COMPACT_LOGO,
    SMART_POCKET_DEFAULT_ICON,
    SMART_POCKET_DEFAULT_FAVICON,
    SMART_POCKET_SAFE_FALLBACK_IMAGE,
  ]
    .map(normalizeAssetIdentity)
    .filter(Boolean);

  const blocked = blockedSources
    .map(normalizeAssetIdentity)
    .filter(Boolean);

  return reservedAssets.includes(normalized) || blocked.includes(normalized);
}

export function getApprovedSocialPreviewAsset(value: string, blockedSources: string[] = []) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return isDisallowedSocialPreviewAsset(trimmed, blockedSources) ? '' : trimmed;
}

function sanitizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeSupportedLanguage(value: unknown): PlatformLocalizationSettings['defaultLanguage'] {
  return value === 'ar' || value === 'fr' || value === 'ru' ? value : 'en';
}

function sanitizeTwitterCard(value: unknown): PlatformSeoSettings['twitterCard'] {
  return value === 'summary' ? 'summary' : 'summary_large_image';
}

function normalizeEnabledLanguages(value: unknown) {
  const fallback = DEFAULT_PLATFORM_SETTINGS.localization.enabledLanguages;
  if (!Array.isArray(value)) return fallback;

  const normalized = value
    .map((entry) => sanitizeSupportedLanguage(entry))
    .filter((entry, index, all) => all.indexOf(entry) === index);

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeKeywords(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
    return normalized.length > 0 ? normalized : fallback;
  }

  if (typeof value === 'string') {
    const normalized = value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    return normalized.length > 0 ? normalized : fallback;
  }

  return fallback;
}

function normalizeNavLinks(value: unknown, fallback: PlatformNavLink[]) {
  if (!Array.isArray(value)) return fallback;
  const seenDestinations = new Set<string>();
  const links = value
    .filter(isObject)
    .map((entry, index) => ({
      id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `link-${index}`,
      label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : '',
      href: typeof entry.href === 'string' && entry.href.trim() ? normalizePublicNavHref(entry.href.trim()) : '',
    }))
    .filter((entry) => {
      if (!entry.label || !entry.href) {
        return false;
      }

      if (seenDestinations.has(entry.href)) {
        return false;
      }

      seenDestinations.add(entry.href);
      return true;
    });
  return links.length > 0 ? links : fallback;
}

function normalizeFooterSections(value: unknown, fallback: PlatformFooterSection[]) {
  if (!Array.isArray(value)) return fallback;
  const sections = value
    .filter(isObject)
    .map((entry, index) => ({
      id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `section-${index}`,
      title: typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : '',
      links: normalizeNavLinks(entry.links, []),
    }))
    .filter((section) => section.title && section.links.length > 0);
  return sections.length > 0 ? sections : fallback;
}

function hexToRgb(hex: string) {
  const safe = sanitizeHexColor(hex, '#000000').slice(1);
  return {
    r: parseInt(safe.slice(0, 2), 16),
    g: parseInt(safe.slice(2, 4), 16),
    b: parseInt(safe.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`;
}

function mixHex(base: string, target: string, weight: number) {
  const a = hexToRgb(base);
  const b = hexToRgb(target);
  return rgbToHex(
    a.r + (b.r - a.r) * weight,
    a.g + (b.g - a.g) * weight,
    a.b + (b.b - a.b) * weight
  );
}

function getContrastingForeground(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance >= 170 ? '#0f172a' : '#ffffff';
}

export function normalizePlatformSettings(value: unknown): PlatformSettingsSnapshot {
  const raw = isObject(value) ? value : {};
  const appName = sanitizeNonEmptyString(raw.app_name, DEFAULT_PLATFORM_SETTINGS.branding.appName);
  const logoUrl = sanitizeNonEmptyString(raw.logo_url, DEFAULT_PLATFORM_SETTINGS.branding.logoUrl);
  const compactLogoUrl = sanitizeOptionalString(raw.compact_logo_url) || logoUrl || DEFAULT_PLATFORM_SETTINGS.branding.compactLogoUrl;
  const faviconUrl = sanitizeOptionalString(raw.favicon_url) || DEFAULT_PLATFORM_SETTINGS.branding.faviconUrl;
  const appleTouchIconUrl = sanitizeOptionalString(raw.apple_touch_icon_url) || compactLogoUrl || faviconUrl || DEFAULT_PLATFORM_SETTINGS.branding.appleTouchIconUrl;
  const pwaIcon192Url = sanitizeOptionalString(raw.pwa_icon_192_url) || appleTouchIconUrl || DEFAULT_PLATFORM_SETTINGS.branding.pwaIcon192Url;
  const pwaIcon512Url = sanitizeOptionalString(raw.pwa_icon_512_url) || appleTouchIconUrl || DEFAULT_PLATFORM_SETTINGS.branding.pwaIcon512Url;
  const blockedSocialFallbackSources = [
    logoUrl,
    compactLogoUrl,
    faviconUrl,
    appleTouchIconUrl,
    pwaIcon192Url,
    pwaIcon512Url,
  ];
  const socialImageUrl =
    getApprovedSocialPreviewAsset(sanitizeOptionalString(raw.social_image_url), blockedSocialFallbackSources) ||
    DEFAULT_PLATFORM_SETTINGS.branding.socialImageUrl;
  const emailLogoUrl = sanitizeOptionalString(raw.email_logo_url) || logoUrl || DEFAULT_PLATFORM_SETTINGS.branding.emailLogoUrl;
  const organizationLogoUrl = sanitizeOptionalString(raw.organization_logo_url) || logoUrl || DEFAULT_PLATFORM_SETTINGS.branding.organizationLogoUrl;

  const branding: PlatformBrandingSettings = {
    appName,
    shortBrandName: sanitizeOptionalString(raw.short_brand_name) || appName,
    tagline: sanitizeNonEmptyString(raw.tagline, DEFAULT_PLATFORM_SETTINGS.branding.tagline),
    logoUrl,
    compactLogoUrl,
    faviconUrl,
    appleTouchIconUrl,
    pwaIcon192Url,
    pwaIcon512Url,
    socialImageUrl,
    emailLogoUrl,
    organizationLogoUrl,
    primaryColor: sanitizeHexColor(raw.primary_color, DEFAULT_PLATFORM_SETTINGS.branding.primaryColor),
    accentColor: sanitizeHexColor(raw.accent_color, DEFAULT_PLATFORM_SETTINGS.branding.accentColor),
    fontFamily: sanitizeFontFamily(raw.font_family),
  };

  const siteTitle = sanitizeNonEmptyString(raw.site_title, DEFAULT_PLATFORM_SETTINGS.seo.siteTitle);
  const siteDescription = sanitizeNonEmptyString(raw.site_description, DEFAULT_PLATFORM_SETTINGS.seo.siteDescription);
  const canonicalUrl = sanitizeOptionalString(raw.canonical_url) || DEFAULT_PLATFORM_SETTINGS.seo.canonicalUrl;
  const ogTitle = sanitizeNonEmptyString(raw.og_title, siteTitle);
  const ogDescription = sanitizeNonEmptyString(raw.og_description, siteDescription);
  const ogImage =
    getApprovedSocialPreviewAsset(sanitizeOptionalString(raw.og_image), blockedSocialFallbackSources) ||
    branding.socialImageUrl;

  const seo: PlatformSeoSettings = {
    siteTitle,
    titleTemplate: sanitizeNonEmptyString(raw.title_template, `%s | ${branding.appName}`),
    siteDescription,
    keywords: normalizeKeywords(raw.keywords, DEFAULT_PLATFORM_SETTINGS.seo.keywords),
    canonicalUrl,
    ogTitle,
    ogDescription,
    ogImage,
    twitterTitle: sanitizeNonEmptyString(raw.twitter_title, ogTitle),
    twitterDescription: sanitizeNonEmptyString(raw.twitter_description, ogDescription),
    twitterImage:
      getApprovedSocialPreviewAsset(sanitizeOptionalString(raw.twitter_image), blockedSocialFallbackSources) ||
      ogImage,
    twitterHandle: sanitizeOptionalString(raw.twitter_handle) || DEFAULT_PLATFORM_SETTINGS.seo.twitterHandle,
    twitterCard: sanitizeTwitterCard(raw.twitter_card ?? raw.twitter_card_type),
    robotsIndex: sanitizeBoolean(raw.robots_index, DEFAULT_PLATFORM_SETTINGS.seo.robotsIndex),
    robotsFollow: sanitizeBoolean(raw.robots_follow, DEFAULT_PLATFORM_SETTINGS.seo.robotsFollow),
    sitemapEnabled: sanitizeBoolean(raw.sitemap_enabled, DEFAULT_PLATFORM_SETTINGS.seo.sitemapEnabled),
    googleSiteVerification: sanitizeOptionalString(raw.google_site_verification),
    bingSiteVerification: sanitizeOptionalString(raw.bing_site_verification),
    organizationName: sanitizeOptionalString(raw.organization_name) || branding.appName,
    organizationLegalName: sanitizeOptionalString(raw.organization_legal_name),
    organizationDescription: sanitizeOptionalString(raw.organization_description) || siteDescription,
  };

  const publicUi: PlatformPublicSettings = {
    headerMenu: normalizeNavLinks(raw.header_menu, DEFAULT_HEADER_MENU),
    stickyHeader: sanitizeBoolean(raw.sticky_header, DEFAULT_PLATFORM_SETTINGS.publicUi.stickyHeader),
    footerSections: normalizeFooterSections(raw.footer_sections, DEFAULT_FOOTER_SECTIONS),
    footerTagline: sanitizeOptionalString(raw.footer_tagline) || branding.tagline,
    footerCompanyName: sanitizeOptionalString(raw.footer_company_name) || branding.appName,
    footerWebsiteUrl: sanitizeOptionalString(raw.footer_website_url) || canonicalUrl,
    footerCopyright: sanitizeOptionalString(raw.footer_copyright) || DEFAULT_PLATFORM_SETTINGS.publicUi.footerCopyright,
    contactEmail: sanitizeOptionalString(raw.contact_email),
    contactPhone: sanitizeOptionalString(raw.contact_phone),
    contactPhoneCountryCode: sanitizeOptionalString(raw.contact_phone_country_code).toUpperCase(),
    contactPhoneFormatted: '',
    contactAddress: sanitizeOptionalString(raw.contact_address),
    socialTwitter: sanitizeOptionalString(raw.social_twitter),
    socialGithub: sanitizeOptionalString(raw.social_github),
    socialLinkedin: sanitizeOptionalString(raw.social_linkedin),
  };

  const email: PlatformEmailSettings = {
    provider: raw.email_provider === 'smtp' ? 'smtp' : 'supabase',
    smtpHost: sanitizeOptionalString(raw.smtp_host),
    smtpPort: sanitizeOptionalString(raw.smtp_port) || DEFAULT_PLATFORM_SETTINGS.email.smtpPort,
    smtpUser: sanitizeOptionalString(raw.smtp_user),
    fromEmail: sanitizeOptionalString(raw.from_email) || DEFAULT_PLATFORM_SETTINGS.email.fromEmail,
    fromName: sanitizeOptionalString(raw.from_name) || DEFAULT_PLATFORM_SETTINGS.email.fromName,
    replyToEmail: sanitizeOptionalString(raw.reply_to_email) || DEFAULT_PLATFORM_SETTINGS.email.replyToEmail,
    supportEmail: sanitizeOptionalString(raw.support_email) || publicUi.contactEmail || DEFAULT_PLATFORM_SETTINGS.email.supportEmail,
    emailLogoUrl: sanitizeOptionalString(raw.email_logo_url) || branding.emailLogoUrl,
    footerCompanyName: publicUi.footerCompanyName,
    footerWebsiteUrl: publicUi.footerWebsiteUrl,
    footerCopyright: publicUi.footerCopyright,
    testRecipientEmail: sanitizeOptionalString(raw.test_recipient_email),
  };

  const analytics: PlatformAnalyticsSettings = {
    googleAnalyticsId: sanitizeOptionalString(raw.google_analytics_id),
    googleTagManagerId: sanitizeOptionalString(raw.google_tag_manager_id),
  };

  return {
    branding,
    seo,
    publicUi,
    email,
    analytics,
    auth: {
      emailPasswordEnabled: sanitizeBoolean(
        raw.email_password_enabled,
        DEFAULT_PLATFORM_SETTINGS.auth.emailPasswordEnabled
      ),
      googleOauthEnabled: sanitizeBoolean(
        raw.google_oauth_enabled,
        DEFAULT_PLATFORM_SETTINGS.auth.googleOauthEnabled
      ),
      appleOauthEnabled: sanitizeBoolean(
        raw.apple_oauth_enabled,
        DEFAULT_PLATFORM_SETTINGS.auth.appleOauthEnabled
      ),
      magicLinkEnabled: sanitizeBoolean(
        raw.magic_link_enabled,
        DEFAULT_PLATFORM_SETTINGS.auth.magicLinkEnabled
      ),
      requireEmailVerification: sanitizeBoolean(
        raw.require_email_verification,
        DEFAULT_PLATFORM_SETTINGS.auth.requireEmailVerification
      ),
      passwordMinLength:
        typeof raw.password_min_length === 'number' && Number.isFinite(raw.password_min_length)
          ? raw.password_min_length
          : DEFAULT_PLATFORM_SETTINGS.auth.passwordMinLength,
    },
    localization: {
      defaultLanguage: sanitizeSupportedLanguage(raw.default_language),
      enabledLanguages: normalizeEnabledLanguages(raw.enabled_languages),
    },
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : undefined,
    raw,
  };
}

export function getSettingsAssetUrl(url: string, updatedAt?: string) {
  if (!url) return '';
  if (!updatedAt) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(updatedAt)}`;
}

export function shouldShowBrandTextBesideLogo(logoUrl?: string) {
  const normalized = typeof logoUrl === 'string' ? logoUrl.trim() : '';
  if (!normalized) return true;

  const defaultLogo = DEFAULT_PLATFORM_SETTINGS.branding.logoUrl;
  return normalized === defaultLogo;
}

export function buildBrandingCssVariables(branding: PlatformBrandingSettings): CSSProperties {
  const primary = sanitizeHexColor(branding.primaryColor, DEFAULT_PLATFORM_SETTINGS.branding.primaryColor);
  const accent = sanitizeHexColor(branding.accentColor, DEFAULT_PLATFORM_SETTINGS.branding.accentColor);
  const primaryRgb = hexToRgb(primary);
  const accentRgb = hexToRgb(accent);
  const primaryForeground = getContrastingForeground(primary);
  const accentForeground = getContrastingForeground(accent);

  let fontValue = "var(--font-plus-jakarta), 'Plus Jakarta Sans', sans-serif";
  if (branding.fontFamily === 'Inter') fontValue = "var(--font-inter), 'Inter', sans-serif";
  if (branding.fontFamily === 'Poppins') fontValue = "var(--font-poppins), 'Poppins', sans-serif";
  if (branding.fontFamily === 'Roboto') fontValue = "var(--font-roboto), 'Roboto', sans-serif";

  const cssVariables: Record<string, string> = {
    '--primary': primary,
    '--primary-rgb': `${primaryRgb.r} ${primaryRgb.g} ${primaryRgb.b}`,
    '--primary-foreground': primaryForeground,
    '--accent': accent,
    '--accent-rgb': `${accentRgb.r} ${accentRgb.g} ${accentRgb.b}`,
    '--accent-foreground': accentForeground,
    '--ring': accent,
    '--navy-600': mixHex(primary, '#ffffff', 0.1),
    '--navy-700': primary,
    '--navy-800': mixHex(primary, '#000000', 0.16),
    '--teal-400': mixHex(accent, '#ffffff', 0.16),
    '--teal-500': accent,
    '--teal-600': mixHex(accent, '#000000', 0.12),
    '--font-sans': fontValue,
  };

  return cssVariables as CSSProperties;
}
