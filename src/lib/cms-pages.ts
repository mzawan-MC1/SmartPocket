import { normalizeSeoKeywordList } from '@/lib/platform-settings';

export type CmsPageStatus = 'draft' | 'published';

export const RESERVED_CMS_SLUGS = [
  'home',
  'about',
  'features',
  'pricing',
  'dashboard',
  'admin',
  'sign-up-login',
] as const;

export const MARKETING_HOME_SLUGS = [
  'about',
  'features',
  'pricing',
] as const;

export const FIXED_PUBLIC_PAGE_SLUGS = [
  'contact',
  'privacy',
  'terms',
] as const;

export const SITEMAP_EXCLUDED_CMS_SLUGS = [
  'home',
  'contact',
  'privacy',
  'terms',
  'about',
  'features',
  'pricing',
] as const;

export type CmsPageRecord = {
  id: string;
  title: string;
  slug: string;
  content_html: string;
  status: CmsPageStatus;
  is_enabled: boolean;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  seo_image_url: string | null;
  og_title: string | null;
  og_description: string | null;
  twitter_title: string | null;
  twitter_description: string | null;
  twitter_image_url: string | null;
  canonical_url_override: string | null;
  robots_index: boolean | null;
  robots_follow: boolean | null;
  show_in_header: boolean;
  show_in_footer: boolean;
  navigation_label: string | null;
  sort_order: number;
  is_protected_system_page: boolean;
  allow_delete: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CmsPageListItem = CmsPageRecord & {
  can_delete: boolean;
};

export type CmsPageInput = {
  title: string;
  slug: string;
  content_html: string;
  status: CmsPageStatus;
  is_enabled: boolean;
  show_in_header: boolean;
  show_in_footer: boolean;
  navigation_label: string;
  sort_order: number;
  allow_delete: boolean;
};

export type CmsPageSeoInput = {
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
  seo_image_url: string;
  og_title: string;
  og_description: string;
  twitter_title: string;
  twitter_description: string;
  twitter_image_url: string;
  canonical_url_override: string;
  robots_index: boolean | null;
  robots_follow: boolean | null;
};

const ALLOWED_TAGS = new Set([
  'a',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'u',
  'ul',
]);

const SELF_CLOSING_TAGS = new Set(['br', 'hr']);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeAttributes(tagName: string, attrs: string) {
  if (!attrs.trim()) {
    return '';
  }

  if (tagName === 'a') {
    const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
    const href = hrefMatch?.[2]?.trim() || '';
    const safeHref =
      href.startsWith('/') ||
      href.startsWith('http://') ||
      href.startsWith('https://') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:')
        ? href
        : '#';

    const isExternal = safeHref.startsWith('http://') || safeHref.startsWith('https://');
    return ` href="${escapeHtml(safeHref)}"${isExternal ? ' target="_blank" rel="noopener noreferrer"' : ''}`;
  }

  return '';
}

export function sanitizeRichTextHtml(html: string) {
  if (!html || !html.trim()) {
    return '';
  }

  let safe = html;
  safe = safe.replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|option)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  safe = safe.replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|option)\b[^>]*\/?\s*>/gi, '');
  safe = safe.replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '');
  safe = safe.replace(/\sstyle\s*=\s*(['"]).*?\1/gi, '');
  safe = safe.replace(/\sclass\s*=\s*(['"]).*?\1/gi, '');

  safe = safe.replace(/<([^>]+)>/g, (full, inner: string) => {
    const trimmed = inner.trim();
    if (!trimmed) {
      return '';
    }

    const isClosing = trimmed.startsWith('/');
    const tagNameMatch = trimmed.match(/^\/?\s*([a-z0-9]+)/i);
    const rawTagName = tagNameMatch?.[1]?.toLowerCase();
    if (!rawTagName || !ALLOWED_TAGS.has(rawTagName)) {
      return '';
    }

    if (isClosing) {
      return SELF_CLOSING_TAGS.has(rawTagName) ? '' : `</${rawTagName}>`;
    }

    const attrSource = trimmed.slice(tagNameMatch![0].length);
    const safeAttrs = sanitizeAttributes(rawTagName, attrSource);
    return SELF_CLOSING_TAGS.has(rawTagName) ? `<${rawTagName}${safeAttrs}>` : `<${rawTagName}${safeAttrs}>`;
  });

  return safe.trim();
}

export function stripHtmlToText(html: string) {
  return sanitizeRichTextHtml(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function slugifyCmsPageSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function isValidCmsPageSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function isReservedCmsSlug(value: string) {
  const slug = slugifyCmsPageSlug(value);
  return RESERVED_CMS_SLUGS.includes(slug as (typeof RESERVED_CMS_SLUGS)[number]);
}

export function isMarketingHomeSlug(value: string) {
  const slug = slugifyCmsPageSlug(value);
  return MARKETING_HOME_SLUGS.includes(slug as (typeof MARKETING_HOME_SLUGS)[number]);
}

export function isFixedPublicPageSlug(value: string) {
  const slug = slugifyCmsPageSlug(value);
  return FIXED_PUBLIC_PAGE_SLUGS.includes(slug as (typeof FIXED_PUBLIC_PAGE_SLUGS)[number]);
}

export function isSitemapExcludedCmsSlug(value: string) {
  const slug = slugifyCmsPageSlug(value);
  return SITEMAP_EXCLUDED_CMS_SLUGS.includes(slug as (typeof SITEMAP_EXCLUDED_CMS_SLUGS)[number]);
}

export function getCmsPageNavigationLabel(page: Pick<CmsPageRecord, 'navigation_label' | 'title'>) {
  const explicitLabel = page.navigation_label?.trim();
  return explicitLabel || page.title;
}

export function deriveCmsSeoTitle(page: Pick<CmsPageRecord, 'seo_title' | 'title'>) {
  const explicitTitle = page.seo_title?.trim();
  return explicitTitle || page.title;
}

export function deriveCmsSeoDescription(page: Pick<CmsPageRecord, 'seo_description' | 'content_html'>) {
  const explicitDescription = page.seo_description?.trim();
  if (explicitDescription) {
    return explicitDescription;
  }

  return stripHtmlToText(page.content_html).slice(0, 160);
}

export function deriveCmsSeoKeywords(page: Pick<CmsPageRecord, 'seo_keywords'>) {
  return normalizeSeoKeywordList(page.seo_keywords, []);
}

export function deriveCmsOgTitle(
  page: Pick<CmsPageRecord, 'og_title' | 'seo_title' | 'title'>
) {
  const explicitTitle = page.og_title?.trim();
  return explicitTitle || deriveCmsSeoTitle(page);
}

export function deriveCmsOgDescription(
  page: Pick<CmsPageRecord, 'og_description' | 'seo_description' | 'content_html'>
) {
  const explicitDescription = page.og_description?.trim();
  return explicitDescription || deriveCmsSeoDescription(page);
}

export function deriveCmsTwitterTitle(
  page: Pick<CmsPageRecord, 'twitter_title' | 'og_title' | 'seo_title' | 'title'>
) {
  const explicitTitle = page.twitter_title?.trim();
  return explicitTitle || deriveCmsOgTitle(page);
}

export function deriveCmsTwitterDescription(
  page: Pick<CmsPageRecord, 'twitter_description' | 'og_description' | 'seo_description' | 'content_html'>
) {
  const explicitDescription = page.twitter_description?.trim();
  return explicitDescription || deriveCmsOgDescription(page);
}

export function normalizeCmsPagePayload(input: Partial<CmsPageInput>) {
  const title = (input.title || '').trim();
  const slug = slugifyCmsPageSlug(input.slug || input.title || '');
  const navigationLabel = (input.navigation_label || '').trim();
  const contentHtml = sanitizeRichTextHtml(input.content_html || '');

  return {
    title,
    slug,
    content_html: contentHtml,
    status: input.status === 'published' ? 'published' : 'draft',
    is_enabled: input.is_enabled !== false,
    show_in_header: Boolean(input.show_in_header),
    show_in_footer: Boolean(input.show_in_footer),
    navigation_label: navigationLabel,
    sort_order: Number.isFinite(input.sort_order) ? Number(input.sort_order) : 0,
    allow_delete: input.allow_delete !== false,
  } satisfies CmsPageInput;
}

export function normalizeCmsPageSeoPayload(input: Partial<CmsPageSeoInput>) {
  const seoKeywords = normalizeSeoKeywordList(input.seo_keywords, []);

  return {
    seo_title: (input.seo_title || '').trim(),
    seo_description: (input.seo_description || '').trim(),
    seo_keywords: seoKeywords.join(', '),
    seo_image_url: (input.seo_image_url || '').trim(),
    og_title: (input.og_title || '').trim(),
    og_description: (input.og_description || '').trim(),
    twitter_title: (input.twitter_title || '').trim(),
    twitter_description: (input.twitter_description || '').trim(),
    twitter_image_url: (input.twitter_image_url || '').trim(),
    canonical_url_override: (input.canonical_url_override || '').trim(),
    robots_index:
      typeof input.robots_index === 'boolean'
        ? input.robots_index
        : null,
    robots_follow:
      typeof input.robots_follow === 'boolean'
        ? input.robots_follow
        : null,
  } satisfies CmsPageSeoInput;
}
