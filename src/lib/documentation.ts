import { sanitizeRichTextHtml, slugifyCmsPageSlug, stripHtmlToText } from '@/lib/cms-pages';
import type { SupportedLanguage } from '@/i18n/resources';
import { SUPPORTED_LANGUAGE_CODES } from '@/i18n/registry';

export const DOCUMENTATION_LANGUAGES = SUPPORTED_LANGUAGE_CODES;
export type DocumentationLanguageCode = (typeof DOCUMENTATION_LANGUAGES)[number];

export type DocumentationStatus = 'draft' | 'published';

export const DOCUMENTATION_CATEGORIES = [
  'getting-started',
  'ai-smart-entry',
  'transactions',
  'accounts',
  'personal-subscriptions',
  'budgets',
  'recurring-transactions',
  'reimbursements',
  'settlements',
  'people-spaces',
  'plans-subscriptions',
  'support-troubleshooting',
  'general',
] as const;

export type DocumentationCategory = (typeof DOCUMENTATION_CATEGORIES)[number];

export type DocumentationArticleRecord = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content_html: string;
  category: string;
  status: DocumentationStatus;
  enabled: boolean;
  display_order: number;
  published_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  en_source_version_hash: string | null;
};

export type DocumentationTranslationStatus =
  | 'current'
  | 'outdated'
  | 'failed'
  | 'pending'
  | 'missing';

export type DocumentationTranslationRecord = {
  id: string;
  article_id: string;
  language_code: string;
  title: string;
  summary: string;
  content_html: string;
  translation_status: DocumentationTranslationStatus;
  source_version_hash: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentationArticleInput = {
  title: string;
  slug: string;
  summary: string;
  content_html: string;
  category: string;
  status: DocumentationStatus;
  enabled: boolean;
  display_order: number;
};

export type PublicDocumentationArticle = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  contentHtml: string;
  category: string;
  localeCode: DocumentationLanguageCode;
  publishedAt: string | null;
  updatedAt: string;
};

export type DocumentationTranslationStatusRow = {
  language: SupportedLanguage;
  status: DocumentationTranslationStatus;
  sourceHashMatch: boolean;
  updatedAt?: string;
  errorMessage?: string;
};

export type DocumentationTranslationStatusResponse = {
  articleId: string;
  sourceHash: string;
  statuses: DocumentationTranslationStatusRow[];
  currentCount: number;
  outdatedCount: number;
  failedCount: number;
  missingCount: number;
  pendingCount: number;
  totalEnabled: number;
};

const DOC_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isDocumentationLanguageCode(value: unknown): value is DocumentationLanguageCode {
  return typeof value === 'string' && DOCUMENTATION_LANGUAGES.some((code) => code === value);
}

export function isValidDocumentationSlug(value: string) {
  return DOC_SLUG_REGEX.test(value);
}

export function normalizeDocumentationSlug(value: unknown) {
  return slugifyCmsPageSlug(typeof value === 'string' ? value : '');
}

export function normalizeDocumentationSortOrder(value: unknown) {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(-9999, Math.min(9999, Math.trunc(parsed)));
}

export function sanitizeDocumentationSingleLine(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function sanitizeDocumentationMultilineText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeDocumentationContentHtml(value: unknown) {
  return sanitizeRichTextHtml(typeof value === 'string' ? value : '').slice(0, 40000);
}

export function isDocumentationCategory(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return trimmed.length <= 80;
}

export function normalizeDocumentationArticleInput(
  input: Partial<DocumentationArticleInput>
): DocumentationArticleInput {
  const rawTitle = typeof input.title === 'string' ? input.title : '';
  const rawSlug = typeof input.slug === 'string' && input.slug.trim() ? input.slug : rawTitle;
  const category = isDocumentationCategory(input.category) ? (input.category as string).trim() : '';

  return {
    title: sanitizeDocumentationSingleLine(rawTitle, 240),
    slug: normalizeDocumentationSlug(rawSlug),
    summary: sanitizeDocumentationMultilineText(input.summary, 500),
    content_html: sanitizeDocumentationContentHtml(input.content_html),
    category,
    status: input.status === 'published' ? 'published' : 'draft',
    enabled: input.enabled !== false,
    display_order: normalizeDocumentationSortOrder(input.display_order),
  };
}

export function validateDocumentationArticleInput(input: DocumentationArticleInput) {
  const issues: Array<{ field: keyof DocumentationArticleInput | null; message: string }> = [];

  if (!input.slug || !isValidDocumentationSlug(input.slug)) {
    issues.push({ field: 'slug', message: 'Enter a valid slug using lowercase letters, numbers, and hyphens only.' });
  }

  if (!input.title || input.title.trim().length === 0) {
    issues.push({ field: 'title', message: 'Title is required.' });
  }

  if (!input.summary || input.summary.trim().length === 0) {
    issues.push({ field: 'summary', message: 'Short summary is required.' });
  }

  if (!input.content_html || !stripHtmlToText(input.content_html).trim()) {
    issues.push({ field: 'content_html', message: 'Document content is required.' });
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function normalizeDocumentationLanguage(
  value: unknown,
  fallback: SupportedLanguage = 'en'
): DocumentationLanguageCode {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (isDocumentationLanguageCode(trimmed)) {
      return trimmed as DocumentationLanguageCode;
    }
    const normalized = trimmed.toLowerCase().replace(/_/g, '-');
    const caseInsensitiveMatch = DOCUMENTATION_LANGUAGES.find(
      (code) => code.toLowerCase() === normalized
    );
    if (caseInsensitiveMatch) {
      return caseInsensitiveMatch;
    }
    const baseLanguage = normalized.split('-')[0];
    const baseMatch = DOCUMENTATION_LANGUAGES.find(
      (code) => code.toLowerCase() === baseLanguage.toLowerCase()
    );
    if (baseMatch) {
      return baseMatch;
    }
  }

  return isDocumentationLanguageCode(fallback) ? fallback : 'en';
}
