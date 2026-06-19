import type { CSSProperties } from 'react';

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
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  accentColor: string;
  fontFamily: 'Plus Jakarta Sans' | 'Inter' | 'Poppins' | 'Roboto';
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
}

export interface PlatformPublicSettings {
  headerMenu: PlatformNavLink[];
  stickyHeader: boolean;
  footerSections: PlatformFooterSection[];
  footerTagline: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  socialTwitter: string;
  socialGithub: string;
  socialLinkedin: string;
}

export interface PlatformAuthSettings {
  emailPasswordEnabled: boolean;
  googleOauthEnabled: boolean;
  appleOauthEnabled: boolean;
  magicLinkEnabled: boolean;
  requireEmailVerification: boolean;
  passwordMinLength: number;
}

export interface PlatformSettingsSnapshot {
  branding: PlatformBrandingSettings;
  seo: PlatformSeoSettings;
  publicUi: PlatformPublicSettings;
  auth: PlatformAuthSettings;
  updatedAt?: string;
  raw: Record<string, unknown>;
}

const MARKETING_HOME_ANCHORS = {
  '/about': '/#about',
  '/features': '/#features',
  '/pricing': '/#pricing',
  '/contact': '/#contact',
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

  return MARKETING_HOME_ANCHORS[normalized as keyof typeof MARKETING_HOME_ANCHORS] || normalized;
}

export function normalizePublicNavHref(href: string) {
  return mapMarketingHrefToHomeAnchor(href);
}

export const DEFAULT_HEADER_MENU: PlatformNavLink[] = [
  { id: 'hm-about', label: 'About', href: '/#about' },
  { id: 'hm-features', label: 'Features', href: '/#features' },
  { id: 'hm-pricing', label: 'Pricing', href: '/#pricing' },
  { id: 'hm-contact', label: 'Contact', href: '/#contact' },
];

export const DEFAULT_FOOTER_SECTIONS: PlatformFooterSection[] = [
  {
    id: 'fs-product',
    title: 'Product',
    links: [
      { id: 'fl-features', label: 'Features', href: '/#features' },
      { id: 'fl-pricing', label: 'Pricing', href: '/#pricing' },
      { id: 'fl-about', label: 'About', href: '/#about' },
    ],
  },
  {
    id: 'fs-support',
    title: 'Support',
    links: [
      { id: 'fl-contact', label: 'Contact', href: '/#contact' },
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
    tagline: 'Personal Finance, Simplified',
    logoUrl: '/assets/images/app_logo.png',
    faviconUrl: '/favicon.ico',
    primaryColor: '#0f3460',
    accentColor: '#00b4d8',
    fontFamily: 'Plus Jakarta Sans',
  },
  seo: {
    siteTitle: 'Smart Pocket — Personal Finance, Simplified',
    titleTemplate: '%s | Smart Pocket',
    siteDescription: 'Smart Pocket helps you track income, expenses, budgets, and financial accounts with professional reporting and a clean mobile-first interface.',
    keywords: ['personal finance', 'budgeting', 'expense tracking', 'money management'],
    canonicalUrl: process.env.NEXT_PUBLIC_SITE_URL || '',
    ogTitle: 'Smart Pocket — Personal Finance, Simplified',
    ogDescription: 'Smart Pocket helps you track income, expenses, budgets, and financial accounts with professional reporting and a clean mobile-first interface.',
    ogImage: '/assets/images/app_logo.png',
    twitterTitle: 'Smart Pocket — Personal Finance, Simplified',
    twitterDescription: 'Smart Pocket helps you track income, expenses, budgets, and financial accounts with professional reporting and a clean mobile-first interface.',
    twitterImage: '/assets/images/app_logo.png',
    twitterHandle: '@smartpocket',
    twitterCard: 'summary_large_image',
    robotsIndex: true,
    robotsFollow: true,
    sitemapEnabled: true,
  },
  publicUi: {
    headerMenu: DEFAULT_HEADER_MENU,
    stickyHeader: true,
    footerSections: DEFAULT_FOOTER_SECTIONS,
    footerTagline: 'Personal finance, simplified.',
    contactEmail: '',
    contactPhone: '',
    contactAddress: '',
    socialTwitter: '',
    socialGithub: '',
    socialLinkedin: '',
  },
  auth: {
    emailPasswordEnabled: true,
    googleOauthEnabled: false,
    appleOauthEnabled: false,
    magicLinkEnabled: false,
    requireEmailVerification: true,
    passwordMinLength: 8,
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

function sanitizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeTwitterCard(value: unknown): PlatformSeoSettings['twitterCard'] {
  return value === 'summary' ? 'summary' : 'summary_large_image';
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
  const branding: PlatformBrandingSettings = {
    appName: sanitizeNonEmptyString(raw.app_name, DEFAULT_PLATFORM_SETTINGS.branding.appName),
    tagline: sanitizeNonEmptyString(raw.tagline, DEFAULT_PLATFORM_SETTINGS.branding.tagline),
    logoUrl: sanitizeNonEmptyString(raw.logo_url, DEFAULT_PLATFORM_SETTINGS.branding.logoUrl),
    faviconUrl: sanitizeNonEmptyString(raw.favicon_url, DEFAULT_PLATFORM_SETTINGS.branding.faviconUrl),
    primaryColor: sanitizeHexColor(raw.primary_color, DEFAULT_PLATFORM_SETTINGS.branding.primaryColor),
    accentColor: sanitizeHexColor(raw.accent_color, DEFAULT_PLATFORM_SETTINGS.branding.accentColor),
    fontFamily: sanitizeFontFamily(raw.font_family),
  };

  const siteTitle = sanitizeNonEmptyString(raw.site_title, DEFAULT_PLATFORM_SETTINGS.seo.siteTitle);
  const siteDescription = sanitizeNonEmptyString(raw.site_description, DEFAULT_PLATFORM_SETTINGS.seo.siteDescription);
  const ogTitle = sanitizeNonEmptyString(raw.og_title, siteTitle);
  const ogDescription = sanitizeNonEmptyString(raw.og_description, siteDescription);
  const ogImage = sanitizeNonEmptyString(raw.og_image, branding.logoUrl);

  const seo: PlatformSeoSettings = {
    siteTitle,
    titleTemplate: sanitizeNonEmptyString(raw.title_template, `%s | ${branding.appName}`),
    siteDescription,
    keywords: normalizeKeywords(raw.keywords, DEFAULT_PLATFORM_SETTINGS.seo.keywords),
    canonicalUrl: sanitizeOptionalString(raw.canonical_url) || DEFAULT_PLATFORM_SETTINGS.seo.canonicalUrl,
    ogTitle,
    ogDescription,
    ogImage,
    twitterTitle: sanitizeNonEmptyString(raw.twitter_title, ogTitle),
    twitterDescription: sanitizeNonEmptyString(raw.twitter_description, ogDescription),
    twitterImage: sanitizeNonEmptyString(raw.twitter_image, ogImage),
    twitterHandle: sanitizeOptionalString(raw.twitter_handle) || DEFAULT_PLATFORM_SETTINGS.seo.twitterHandle,
    twitterCard: sanitizeTwitterCard(raw.twitter_card ?? raw.twitter_card_type),
    robotsIndex: sanitizeBoolean(raw.robots_index, DEFAULT_PLATFORM_SETTINGS.seo.robotsIndex),
    robotsFollow: sanitizeBoolean(raw.robots_follow, DEFAULT_PLATFORM_SETTINGS.seo.robotsFollow),
    sitemapEnabled: sanitizeBoolean(raw.sitemap_enabled, DEFAULT_PLATFORM_SETTINGS.seo.sitemapEnabled),
  };

  return {
    branding,
    seo,
    publicUi: {
      headerMenu: normalizeNavLinks(raw.header_menu, DEFAULT_HEADER_MENU),
      stickyHeader: sanitizeBoolean(raw.sticky_header, DEFAULT_PLATFORM_SETTINGS.publicUi.stickyHeader),
      footerSections: normalizeFooterSections(raw.footer_sections, DEFAULT_FOOTER_SECTIONS),
      footerTagline: sanitizeOptionalString(raw.footer_tagline) || branding.tagline,
      contactEmail: sanitizeOptionalString(raw.contact_email),
      contactPhone: sanitizeOptionalString(raw.contact_phone),
      contactAddress: sanitizeOptionalString(raw.contact_address),
      socialTwitter: sanitizeOptionalString(raw.social_twitter),
      socialGithub: sanitizeOptionalString(raw.social_github),
      socialLinkedin: sanitizeOptionalString(raw.social_linkedin),
    },
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
