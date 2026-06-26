import 'server-only';

import { cache } from 'react';
import { unstable_noStore as noStore } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getPublicCmsPageBySlug } from '@/lib/cms-pages-server';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  FaqCategoryRecord,
  FaqCategoryTranslationInput,
  FaqCategoryTranslationRecord,
  FaqItemRecord,
  FaqItemTranslationInput,
  FaqItemTranslationRecord,
  FaqLanguageCode,
  PublicFaqCategory,
  PublicFaqItem,
} from '@/lib/faqs';
import {
  FAQ_LANGUAGES,
  buildFaqTranslationCompleteness,
  createEmptyFaqCategoryTranslations,
  createEmptyFaqItemTranslations,
  normalizeFaqLanguage,
  resolveFaqTranslation,
  stripFaqAnswerToText,
} from '@/lib/faqs';

export type AdminFaqCategory = FaqCategoryRecord & {
  translations: Record<FaqLanguageCode, FaqCategoryTranslationInput>;
  question_count: number;
  missing_translation_count: number;
  translation_states: Array<{
    language: FaqLanguageCode;
    isComplete: boolean;
    missingFields: string[];
  }>;
};

export type AdminFaqItem = FaqItemRecord & {
  category_slug: string;
  category_name: string;
  translations: Record<FaqLanguageCode, FaqItemTranslationInput>;
  missing_translation_count: number;
  translation_states: Array<{
    language: FaqLanguageCode;
    isComplete: boolean;
    missingFields: string[];
  }>;
};

export type AdminFaqDashboardData = {
  categories: AdminFaqCategory[];
  items: AdminFaqItem[];
  metrics: {
    totalCategories: number;
    publishedFaqs: number;
    draftFaqs: number;
    missingTranslations: number;
  };
};

export type PublicFaqPageData = {
  categories: PublicFaqCategory[];
  items: PublicFaqItem[];
  seoPage: Awaited<ReturnType<typeof getPublicCmsPageBySlug>>;
};

async function createAnonClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

type AnonClient = NonNullable<Awaited<ReturnType<typeof createAnonClient>>>;
type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

async function readFaqTablesWithAnonClient(client: AnonClient) {
  const [categoriesResult, categoryTranslationsResult, itemsResult, itemTranslationsResult] =
    await Promise.all([
      client
        .from('faq_categories')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      client
        .from('faq_category_translations')
        .select('*')
        .order('language_code', { ascending: true }),
      client
        .from('faq_items')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      client
        .from('faq_item_translations')
        .select('*')
        .order('language_code', { ascending: true }),
    ]);

  const error =
    categoriesResult.error ||
    categoryTranslationsResult.error ||
    itemsResult.error ||
    itemTranslationsResult.error;

  if (error) {
    throw error;
  }

  return {
    categories: (categoriesResult.data || []) as FaqCategoryRecord[],
    categoryTranslations: (categoryTranslationsResult.data || []) as FaqCategoryTranslationRecord[],
    items: (itemsResult.data || []) as FaqItemRecord[],
    itemTranslations: (itemTranslationsResult.data || []) as FaqItemTranslationRecord[],
  };
}

async function readFaqTablesWithAdminClient(client: AdminClient) {
  const [categoriesResult, categoryTranslationsResult, itemsResult, itemTranslationsResult] =
    await Promise.all([
      client
        .from('faq_categories')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      client
        .from('faq_category_translations')
        .select('*')
        .order('language_code', { ascending: true }),
      client
        .from('faq_items')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      client
        .from('faq_item_translations')
        .select('*')
        .order('language_code', { ascending: true }),
    ]);

  const error =
    categoriesResult.error ||
    categoryTranslationsResult.error ||
    itemsResult.error ||
    itemTranslationsResult.error;

  if (error) {
    throw error;
  }

  return {
    categories: (categoriesResult.data || []) as FaqCategoryRecord[],
    categoryTranslations: (categoryTranslationsResult.data || []) as FaqCategoryTranslationRecord[],
    items: (itemsResult.data || []) as FaqItemRecord[],
    itemTranslations: (itemTranslationsResult.data || []) as FaqItemTranslationRecord[],
  };
}

function buildCategoryTranslationMap(
  categoryTranslations: FaqCategoryTranslationRecord[]
) {
  const byCategory = new Map<string, Record<FaqLanguageCode, FaqCategoryTranslationInput>>();

  for (const translation of categoryTranslations) {
    const current = byCategory.get(translation.category_id) || createEmptyFaqCategoryTranslations();
    current[translation.language_code] = {
      name: translation.name || '',
      description: translation.description || '',
    };
    byCategory.set(translation.category_id, current);
  }

  return byCategory;
}

function buildItemTranslationMap(
  itemTranslations: FaqItemTranslationRecord[]
) {
  const byItem = new Map<string, Record<FaqLanguageCode, FaqItemTranslationInput>>();

  for (const translation of itemTranslations) {
    const current = byItem.get(translation.item_id) || createEmptyFaqItemTranslations();
    current[translation.language_code] = {
      question: translation.question || '',
      answer_html: translation.answer_html || '',
      keywords: Array.isArray(translation.keywords) ? translation.keywords : [],
    };
    byItem.set(translation.item_id, current);
  }

  return byItem;
}

function buildAdminDashboardData(args: {
  categories: FaqCategoryRecord[];
  categoryTranslations: FaqCategoryTranslationRecord[];
  items: FaqItemRecord[];
  itemTranslations: FaqItemTranslationRecord[];
}): AdminFaqDashboardData {
  const categoryTranslationsByCategory = buildCategoryTranslationMap(args.categoryTranslations);
  const itemTranslationsByItem = buildItemTranslationMap(args.itemTranslations);

  const questionCountByCategory = new Map<string, number>();
  for (const item of args.items) {
    questionCountByCategory.set(item.category_id, (questionCountByCategory.get(item.category_id) || 0) + 1);
  }

  const categories = args.categories.map((category) => {
    const translations =
      categoryTranslationsByCategory.get(category.id) || createEmptyFaqCategoryTranslations();
    const completeness = buildFaqTranslationCompleteness(translations, ['name', 'description']);

    return {
      ...category,
      translations,
      question_count: questionCountByCategory.get(category.id) || 0,
      missing_translation_count: completeness.missingCount,
      translation_states: completeness.states,
    } satisfies AdminFaqCategory;
  });

  const categoryNameById = new Map<string, string>();
  const categorySlugById = new Map<string, string>();
  for (const category of categories) {
    categoryNameById.set(category.id, category.translations.en.name || category.slug);
    categorySlugById.set(category.id, category.slug);
  }

  const items = args.items.map((item) => {
    const translations = itemTranslationsByItem.get(item.id) || createEmptyFaqItemTranslations();
    const completeness = buildFaqTranslationCompleteness(translations, [
      'question',
      'answer_html',
      'keywords',
    ]);

    return {
      ...item,
      category_slug: categorySlugById.get(item.category_id) || '',
      category_name: categoryNameById.get(item.category_id) || '',
      translations,
      missing_translation_count: completeness.missingCount,
      translation_states: completeness.states,
    } satisfies AdminFaqItem;
  });

  return {
    categories,
    items,
    metrics: {
      totalCategories: categories.length,
      publishedFaqs: items.filter((item) => item.is_active).length,
      draftFaqs: items.filter((item) => !item.is_active).length,
      missingTranslations:
        categories.reduce((sum, category) => sum + category.missing_translation_count, 0) +
        items.reduce((sum, item) => sum + item.missing_translation_count, 0),
    },
  };
}

function buildPublicPageData(args: {
  categories: FaqCategoryRecord[];
  categoryTranslations: FaqCategoryTranslationRecord[];
  items: FaqItemRecord[];
  itemTranslations: FaqItemTranslationRecord[];
  language: FaqLanguageCode;
  seoPage: Awaited<ReturnType<typeof getPublicCmsPageBySlug>>;
}): PublicFaqPageData {
  const categoryTranslationsByCategory = new Map<string, FaqCategoryTranslationRecord[]>();
  for (const translation of args.categoryTranslations) {
    const current = categoryTranslationsByCategory.get(translation.category_id) || [];
    current.push(translation);
    categoryTranslationsByCategory.set(translation.category_id, current);
  }

  const itemTranslationsByItem = new Map<string, FaqItemTranslationRecord[]>();
  for (const translation of args.itemTranslations) {
    const current = itemTranslationsByItem.get(translation.item_id) || [];
    current.push(translation);
    itemTranslationsByItem.set(translation.item_id, current);
  }

  const categories = args.categories
    .filter((category) => category.is_active)
    .map((category) => {
      const resolved = resolveFaqTranslation(
        categoryTranslationsByCategory.get(category.id) || [],
        args.language
      );

      if (!resolved) {
        return null;
      }

      return {
        id: category.id,
        slug: category.slug,
        icon: category.icon,
        sortOrder: category.sort_order,
        name: resolved.translation.name,
        description: resolved.translation.description,
      } satisfies PublicFaqCategory;
    })
    .filter((category): category is PublicFaqCategory => Boolean(category))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const activeCategoryIds = new Set(categories.map((category) => category.id));
  const categorySlugById = new Map(categories.map((category) => [category.id, category.slug] as const));

  const items = args.items
    .filter((item) => item.is_active && activeCategoryIds.has(item.category_id))
    .map((item) => {
      const resolved = resolveFaqTranslation(itemTranslationsByItem.get(item.id) || [], args.language);
      if (!resolved) {
        return null;
      }

      return {
        id: item.id,
        categoryId: item.category_id,
        categorySlug: categorySlugById.get(item.category_id) || '',
        slug: item.slug,
        sortOrder: item.sort_order,
        isFeatured: item.is_featured,
        question: resolved.translation.question,
        answerHtml: resolved.translation.answer_html,
        answerText: stripFaqAnswerToText(resolved.translation.answer_html),
        keywords: Array.isArray(resolved.translation.keywords) ? resolved.translation.keywords : [],
      } satisfies PublicFaqItem;
    })
    .filter((item): item is PublicFaqItem => Boolean(item))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.question.localeCompare(b.question));

  return {
    categories,
    items,
    seoPage: args.seoPage,
  };
}

async function readPublicFaqDataWithAnon(language: FaqLanguageCode) {
  const supabase = await createAnonClient();
  if (!supabase) {
    return null;
  }

  const [tables, seoPage] = await Promise.all([
    readFaqTablesWithAnonClient(supabase),
    getPublicCmsPageBySlug('faqs'),
  ]);

  return buildPublicPageData({
    ...tables,
    language,
    seoPage,
  });
}

async function readPublicFaqDataWithAdmin(language: FaqLanguageCode) {
  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  const [tables, seoPage] = await Promise.all([
    readFaqTablesWithAdminClient(admin),
    getPublicCmsPageBySlug('faqs'),
  ]);

  return buildPublicPageData({
    ...tables,
    language,
    seoPage,
  });
}

export const getPublicFaqPageData = cache(
  async (languageInput: FaqLanguageCode | string): Promise<PublicFaqPageData> => {
    noStore();

    const language = normalizeFaqLanguage(languageInput);

    try {
      const anonData = await readPublicFaqDataWithAnon(language);
      if (anonData) {
        return anonData;
      }
    } catch {}

    try {
      const adminData = await readPublicFaqDataWithAdmin(language);
      if (adminData) {
        return adminData;
      }
    } catch {}

    return {
      categories: [],
      items: [],
      seoPage: null,
    };
  }
);

export async function getAdminFaqDashboardData(): Promise<AdminFaqDashboardData> {
  noStore();

  const admin = createAdminClient();
  if (!admin) {
    return {
      categories: [],
      items: [],
      metrics: {
        totalCategories: 0,
        publishedFaqs: 0,
        draftFaqs: 0,
        missingTranslations: 0,
      },
    };
  }

  const tables = await readFaqTablesWithAdminClient(admin);
  return buildAdminDashboardData(tables);
}

export function getLanguageOrder() {
  return [...FAQ_LANGUAGES];
}
