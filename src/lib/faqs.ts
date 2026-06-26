import { sanitizeRichTextHtml, slugifyCmsPageSlug, stripHtmlToText } from '@/lib/cms-pages';
import type { SupportedLanguage } from '@/i18n/resources';

export const FAQ_LANGUAGES = ['en', 'ar', 'fr', 'ru'] as const;
export type FaqLanguageCode = (typeof FAQ_LANGUAGES)[number];

export const FAQ_ICON_OPTIONS = [
  'rocket',
  'sparkles',
  'receipt',
  'wallet',
  'credit-card',
  'piggy-bank',
  'repeat',
  'rotate-ccw',
  'handshake',
  'users',
  'life-buoy',
  'circle-help',
  'bot',
  'folder-kanban',
] as const;

export type FaqIconName = (typeof FAQ_ICON_OPTIONS)[number];

export type FaqCategoryRecord = {
  id: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FaqCategoryTranslationRecord = {
  id: string;
  category_id: string;
  language_code: FaqLanguageCode;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

export type FaqItemRecord = {
  id: string;
  category_id: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
};

export type FaqItemTranslationRecord = {
  id: string;
  item_id: string;
  language_code: FaqLanguageCode;
  question: string;
  answer_html: string;
  keywords: string[];
  created_at: string;
  updated_at: string;
};

export type FaqCategoryTranslationInput = {
  name: string;
  description: string;
};

export type FaqItemTranslationInput = {
  question: string;
  answer_html: string;
  keywords: string[];
};

export type FaqCategoryInput = {
  slug: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  translations: Record<FaqLanguageCode, FaqCategoryTranslationInput>;
};

export type FaqItemInput = {
  category_id: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  is_featured: boolean;
  translations: Record<FaqLanguageCode, FaqItemTranslationInput>;
};

export type PublicFaqCategory = {
  id: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
  name: string;
  description: string;
};

export type PublicFaqItem = {
  id: string;
  categoryId: string;
  categorySlug: string;
  slug: string;
  sortOrder: number;
  isFeatured: boolean;
  question: string;
  answerHtml: string;
  answerText: string;
  keywords: string[];
};

type TranslationPair<TLanguage extends string, TValue> = {
  language_code: TLanguage;
} & TValue;

const FAQ_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FAQ_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isFaqLanguageCode(value: unknown): value is FaqLanguageCode {
  return value === 'en' || value === 'ar' || value === 'fr' || value === 'ru';
}

export function isSupportedFaqIcon(value: unknown): value is FaqIconName {
  return typeof value === 'string' && FAQ_ICON_OPTIONS.some((item) => item === value);
}

export function normalizeFaqSlug(value: unknown) {
  return slugifyCmsPageSlug(typeof value === 'string' ? value : '');
}

export function isValidFaqSlug(value: string) {
  return FAQ_SLUG_REGEX.test(value);
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && FAQ_UUID_REGEX.test(value);
}

export function normalizeFaqSortOrder(value: unknown) {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(-9999, Math.min(9999, Math.trunc(parsed)));
}

export function sanitizeFaqSingleLine(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeFaqMultilineText(value: unknown, maxLength: number) {
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

export function sanitizeFaqAnswerHtml(value: unknown) {
  return sanitizeRichTextHtml(typeof value === 'string' ? value : '').slice(0, 12000);
}

export function sanitizeFaqKeywords(value: unknown) {
  const entries = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const normalized = entries
    .map((entry) => sanitizeFaqSingleLine(entry, 80))
    .filter(Boolean);

  return normalized.filter((entry, index) => normalized.indexOf(entry) === index).slice(0, 20);
}

export function createEmptyFaqCategoryTranslations(): Record<FaqLanguageCode, FaqCategoryTranslationInput> {
  return {
    en: { name: '', description: '' },
    ar: { name: '', description: '' },
    fr: { name: '', description: '' },
    ru: { name: '', description: '' },
  };
}

export function createEmptyFaqItemTranslations(): Record<FaqLanguageCode, FaqItemTranslationInput> {
  return {
    en: { question: '', answer_html: '', keywords: [] },
    ar: { question: '', answer_html: '', keywords: [] },
    fr: { question: '', answer_html: '', keywords: [] },
    ru: { question: '', answer_html: '', keywords: [] },
  };
}

export function normalizeFaqCategoryInput(input: Partial<FaqCategoryInput>): FaqCategoryInput {
  const translations = createEmptyFaqCategoryTranslations();

  for (const language of FAQ_LANGUAGES) {
    const source = input.translations?.[language];
    translations[language] = {
      name: sanitizeFaqSingleLine(source?.name, 120),
      description: sanitizeFaqMultilineText(source?.description, 400),
    };
  }

  return {
    slug: normalizeFaqSlug(input.slug || translations.en.name),
    icon: isSupportedFaqIcon(input.icon) ? input.icon : null,
    sort_order: normalizeFaqSortOrder(input.sort_order),
    is_active: input.is_active !== false,
    translations,
  };
}

export function normalizeFaqItemInput(input: Partial<FaqItemInput>): FaqItemInput {
  const translations = createEmptyFaqItemTranslations();

  for (const language of FAQ_LANGUAGES) {
    const source = input.translations?.[language];
    translations[language] = {
      question: sanitizeFaqSingleLine(source?.question, 240),
      answer_html: sanitizeFaqAnswerHtml(source?.answer_html),
      keywords: sanitizeFaqKeywords(source?.keywords),
    };
  }

  return {
    category_id: typeof input.category_id === 'string' ? input.category_id : '',
    slug: normalizeFaqSlug(input.slug || translations.en.question),
    sort_order: normalizeFaqSortOrder(input.sort_order),
    is_active: input.is_active !== false,
    is_featured: Boolean(input.is_featured),
    translations,
  };
}

export function validateFaqCategoryInput(input: FaqCategoryInput) {
  if (!input.slug || !isValidFaqSlug(input.slug)) {
    return 'Enter a valid slug using lowercase letters, numbers, and hyphens only.';
  }

  if (!input.translations.en.name) {
    return 'English category name is required.';
  }

  if (!input.translations.en.description) {
    return 'English category description is required.';
  }

  return null;
}

export function validateFaqItemInput(input: FaqItemInput) {
  if (!isValidUuid(input.category_id)) {
    return 'Select a valid category.';
  }

  if (!input.slug || !isValidFaqSlug(input.slug)) {
    return 'Enter a valid slug using lowercase letters, numbers, and hyphens only.';
  }

  if (!input.translations.en.question) {
    return 'English question is required.';
  }

  if (!input.translations.en.answer_html) {
    return 'English answer is required.';
  }

  return null;
}

export function resolveFaqTranslation<TValue extends Record<string, unknown>, TLanguage extends FaqLanguageCode>(
  translations: Array<TranslationPair<TLanguage, TValue>>,
  language: TLanguage
) {
  const exact = translations.find((translation) => translation.language_code === language);
  if (exact) {
    return {
      translation: exact,
      usedFallback: false,
      translationLanguage: language,
    };
  }

  const english = translations.find((translation) => translation.language_code === 'en');
  if (english) {
    return {
      translation: english,
      usedFallback: language !== 'en',
      translationLanguage: 'en' as const,
    };
  }

  const first = translations[0];
  return first
    ? {
        translation: first,
        usedFallback: true,
        translationLanguage: first.language_code,
      }
    : null;
}

export function buildFaqTranslationCompleteness(
  translations: Partial<Record<FaqLanguageCode, Record<string, unknown> | undefined>>,
  requiredFields: string[]
) {
  const states = FAQ_LANGUAGES.map((language) => {
    const translation = translations[language];
    const missingFields = requiredFields.filter((field) => {
      const value = translation?.[field];
      if (Array.isArray(value)) {
        return value.length === 0;
      }
      return typeof value !== 'string' || !value.trim();
    });

    return {
      language,
      isComplete: missingFields.length === 0,
      missingFields,
    };
  });

  return {
    states,
    missingCount: states.filter((state) => !state.isComplete).length,
  };
}

export function stripFaqAnswerToText(answerHtml: string) {
  return stripHtmlToText(answerHtml);
}

export function keywordStringToArray(value: string) {
  return sanitizeFaqKeywords(value);
}

export function keywordArrayToString(value: string[]) {
  return sanitizeFaqKeywords(value).join(', ');
}

export function formatFaqHash(slug: string) {
  return `faq-${slug}`;
}

export function isFaqHash(value: string | null | undefined) {
  return typeof value === 'string' && value.startsWith('faq-');
}

export function hashToFaqSlug(value: string | null | undefined) {
  if (typeof value !== 'string' || !value.startsWith('faq-')) {
    return '';
  }
  return normalizeFaqSlug(value.slice(4));
}

export function normalizeFaqLanguage(value: unknown, fallback: SupportedLanguage = 'en'): FaqLanguageCode {
  return isFaqLanguageCode(value) ? value : fallback;
}
