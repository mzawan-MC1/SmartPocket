import { sanitizeRichTextHtml, slugifyCmsPageSlug, stripHtmlToText } from '@/lib/cms-pages';
import type { SupportedLanguage } from '@/i18n/resources';
import { SUPPORTED_LANGUAGE_CODES } from '@/i18n/registry';

export const DOCUMENTATION_LANGUAGES = SUPPORTED_LANGUAGE_CODES;
export type DocumentationLanguageCode = (typeof DOCUMENTATION_LANGUAGES)[number];

export function isDocumentationContentRtl(localeCode: DocumentationLanguageCode | string): boolean {
  return String(localeCode).toLowerCase() === 'ar';
}

export function documentationContentDir(
  localeCode: DocumentationLanguageCode | string
): 'rtl' | 'ltr' {
  return isDocumentationContentRtl(localeCode) ? 'rtl' : 'ltr';
}

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
  featured_in_footer: boolean;
  featured_in_header: boolean;
  featured_order: number;
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
  featured_in_footer: boolean;
  featured_in_header: boolean;
  featured_order: number;
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

export type DocumentationCategoryTranslation = { name?: string; description?: string };
export type DocumentationCategoryTranslations = Partial<Record<SupportedLanguage, DocumentationCategoryTranslation>>;

export type CanonicalDocumentationCategorySpec = {
  slug: string;
  name: string;
  description: string;
  display_order: number;
  is_active?: boolean;
  aliasOf?: string;
};

export const CANONICAL_DOCUMENTATION_CATEGORIES: CanonicalDocumentationCategorySpec[] = [
  { slug: 'getting-started',         name: 'Getting Started',            description: 'Welcome, onboarding, and initial setup guides.',                        display_order: 1  },
  { slug: 'ai-smart-entry',          name: 'AI Smart Entry',             description: 'Receipt OCR, Smart AI parsing, and Voice Entry.',                        display_order: 2  },
  { slug: 'transactions',            name: 'Transactions',               description: 'Expense, income, transfers and cash flow views.',                        display_order: 3  },
  { slug: 'accounts-wallets',        name: 'Accounts & Wallets',         description: 'Bank accounts, wallets, cards, and currencies.',                         display_order: 4  },
  { slug: 'accounts',                name: 'Accounts & Wallets',         description: 'Alias for Accounts & Wallets (legacy slug).',                            display_order: 4, aliasOf: 'accounts-wallets' },
  { slug: 'personal-subscriptions',  name: 'Personal Subscriptions',     description: 'Recurring bills, plan subscriptions and tracking.',                      display_order: 5  },
  { slug: 'budgets',                 name: 'Budgets',                    description: 'Spending limits, budgeting plans and targets.',                          display_order: 6  },
  { slug: 'recurring-transactions',  name: 'Recurring Transactions',     description: 'Scheduled and recurring income or expense rules.',                       display_order: 7  },
  { slug: 'reimbursements',          name: 'Reimbursements',             description: 'IOUs, reimbursements and money owed tracking.',                          display_order: 8  },
  { slug: 'settlements',             name: 'Settlements',                description: 'Split expense settlements and net balance closing.',                     display_order: 9  },
  { slug: 'people-spaces',           name: 'People & Spaces',            description: 'Groups, shared money, invitations and shared budgets.',                  display_order: 10 },
  { slug: 'plans-subscriptions',     name: 'Plans & Subscriptions',      description: 'Smart Pocket pricing, plans and subscription management.',               display_order: 11 },
  { slug: 'support-troubleshooting', name: 'Support & Troubleshooting',  description: 'Troubleshooting, support channels and error recovery.',                  display_order: 12 },
  { slug: 'savings-tools',           name: 'Savings & Financial Tools',  description: 'Savings goals, investments, calculators, FX tools.',                     display_order: 13 },
  { slug: 'general',                 name: 'General',                    description: 'Platform settings, legal, and miscellaneous help articles.',            display_order: 99 },
];

export type DocumentationCategoryRecord = {
  id: string;
  name: string;
  slug: string;
  description: string;
  translations: DocumentationCategoryTranslations;
  display_order: number;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentationCategoryWithCount = DocumentationCategoryRecord & {
  articles_count: number;
};

export type DocumentationCategoryInput = {
  name: string;
  slug: string;
  description: string;
  translations?: DocumentationCategoryTranslations;
  display_order: number;
  is_active: boolean;
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
    featured_in_footer: input.featured_in_footer === true,
    featured_in_header: input.featured_in_header === true,
    featured_order: normalizeDocumentationSortOrder(input.featured_order),
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

export function sanitizeDocumentationCategorySingleLine(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function isDocumentationCategoryNameValid(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 120;
}

export function normalizeDocumentationCategoryInput(
  input: Partial<DocumentationCategoryInput>
): DocumentationCategoryInput {
  const rawName =
    typeof input.name === 'string' && input.name.trim() ? input.name : '';
  const rawSlug =
    typeof input.slug === 'string' && input.slug.trim()
      ? input.slug
      : slugifyCmsPageSlug(rawName);

  const rawTranslations = input.translations && typeof input.translations === 'object'
    ? input.translations
    : undefined;

  const normalizedTranslations: DocumentationCategoryTranslations = {};
  if (rawTranslations) {
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      const entry = (rawTranslations as Record<string, unknown>)[code];
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const hasName = typeof e.name === 'string' && e.name.trim().length > 0;
      const hasDescription = typeof e.description === 'string' && e.description.trim().length > 0;
      if (!hasName && !hasDescription) continue;
      normalizedTranslations[code] = {
        ...(hasName ? { name: sanitizeDocumentationCategorySingleLine(e.name, 120) } : {}),
        ...(hasDescription ? { description: sanitizeDocumentationMultilineText(e.description, 500) } : {}),
      };
    }
  }

  return {
    name: sanitizeDocumentationCategorySingleLine(rawName, 120),
    slug: normalizeDocumentationSlug(rawSlug),
    description: sanitizeDocumentationMultilineText(input.description, 500),
    translations: Object.keys(normalizedTranslations).length > 0 ? normalizedTranslations : undefined,
    display_order: normalizeDocumentationSortOrder(input.display_order),
    is_active: input.is_active !== false,
  };
}

export function validateDocumentationCategoryInput(input: DocumentationCategoryInput) {
  const issues: Array<{
    field: keyof DocumentationCategoryInput | null;
    message: string;
  }> = [];

  if (!isDocumentationCategoryNameValid(input.name)) {
    issues.push({
      field: 'name',
      message: 'Name is required (120 characters or fewer).',
    });
  }

  if (!input.slug || !isValidDocumentationSlug(input.slug)) {
    issues.push({
      field: 'slug',
      message:
        'Enter a valid slug using lowercase letters, numbers, and hyphens only.',
    });
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
