import 'server-only';

import type { PostgrestError } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { FaqCategoryInput, FaqItemInput } from '@/lib/faqs';
import {
  FAQ_LANGUAGES,
  createEmptyFaqCategoryTranslations,
  createEmptyFaqItemTranslations,
  isFaqLanguageCode,
} from '@/lib/faqs';
import { getAdminFaqDashboardData } from '@/lib/faqs-server';

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

function isPgConflict(error: PostgrestError | null) {
  return error?.code === '23505';
}

export async function ensureUniqueFaqCategorySlug(args: {
  admin: AdminClient;
  slug: string;
  currentId?: string | null;
}) {
  const { data, error } = await args.admin
    .from('faq_categories')
    .select('id')
    .ilike('slug', args.slug);

  if (error) {
    throw error;
  }

  return !(data || []).some((row) => row.id !== args.currentId);
}

export async function ensureUniqueFaqItemSlug(args: {
  admin: AdminClient;
  slug: string;
  currentId?: string | null;
}) {
  const { data, error } = await args.admin
    .from('faq_items')
    .select('id')
    .ilike('slug', args.slug);

  if (error) {
    throw error;
  }

  return !(data || []).some((row) => row.id !== args.currentId);
}

export async function loadFaqCategoryOrNull(admin: AdminClient, id: string) {
  const { data, error } = await admin
    .from('faq_categories')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function loadFaqItemOrNull(admin: AdminClient, id: string) {
  const { data, error } = await admin
    .from('faq_items')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function loadFaqCategoryInputOrNull(admin: AdminClient, id: string) {
  const [category, translationsResult] = await Promise.all([
    loadFaqCategoryOrNull(admin, id),
    admin
      .from('faq_category_translations')
      .select('language_code, name, description')
      .eq('category_id', id),
  ]);

  if (!category) {
    return null;
  }

  if (translationsResult.error) {
    throw translationsResult.error;
  }

  const translations = createEmptyFaqCategoryTranslations();
  for (const row of translationsResult.data || []) {
    const languageCode = row.language_code;
    if (!isFaqLanguageCode(languageCode)) {
      continue;
    }
    translations[languageCode] = {
      name: row.name || '',
      description: row.description || '',
    };
  }

  return {
    slug: category.slug,
    icon: category.icon,
    sort_order: category.sort_order,
    is_active: category.is_active,
    translations,
  } satisfies FaqCategoryInput;
}

export async function loadFaqItemInputOrNull(admin: AdminClient, id: string) {
  const [item, translationsResult] = await Promise.all([
    loadFaqItemOrNull(admin, id),
    admin
      .from('faq_item_translations')
      .select('language_code, question, answer_html, keywords')
      .eq('item_id', id),
  ]);

  if (!item) {
    return null;
  }

  if (translationsResult.error) {
    throw translationsResult.error;
  }

  const translations = createEmptyFaqItemTranslations();
  for (const row of translationsResult.data || []) {
    const languageCode = row.language_code;
    if (!isFaqLanguageCode(languageCode)) {
      continue;
    }
    translations[languageCode] = {
      question: row.question || '',
      answer_html: row.answer_html || '',
      keywords: Array.isArray(row.keywords) ? row.keywords : [],
    };
  }

  return {
    category_id: item.category_id,
    slug: item.slug,
    sort_order: item.sort_order,
    is_active: item.is_active,
    is_featured: item.is_featured,
    translations,
  } satisfies FaqItemInput;
}

export async function upsertFaqCategoryTranslations(args: {
  admin: AdminClient;
  categoryId: string;
  input: FaqCategoryInput;
}) {
  const rows = FAQ_LANGUAGES.map((language) => ({
    category_id: args.categoryId,
    language_code: language,
    name: args.input.translations[language].name,
    description: args.input.translations[language].description,
  }));

  const { error } = await args.admin
    .from('faq_category_translations')
    .upsert(rows, { onConflict: 'category_id,language_code' });

  if (error) {
    throw error;
  }
}

export async function upsertFaqItemTranslations(args: {
  admin: AdminClient;
  itemId: string;
  input: FaqItemInput;
}) {
  const rows = FAQ_LANGUAGES.map((language) => ({
    item_id: args.itemId,
    language_code: language,
    question: args.input.translations[language].question,
    answer_html: args.input.translations[language].answer_html,
    keywords: args.input.translations[language].keywords,
  }));

  const { error } = await args.admin
    .from('faq_item_translations')
    .upsert(rows, { onConflict: 'item_id,language_code' });

  if (error) {
    throw error;
  }
}

export async function createFaqCategory(args: {
  admin: AdminClient;
  input: FaqCategoryInput;
}) {
  const { data, error } = await args.admin
    .from('faq_categories')
    .insert({
      slug: args.input.slug,
      icon: args.input.icon,
      sort_order: args.input.sort_order,
      is_active: args.input.is_active,
    })
    .select('*')
    .single();

  if (error) {
    if (isPgConflict(error)) {
      throw new Error('A category with this slug already exists.');
    }
    throw error;
  }

  await upsertFaqCategoryTranslations({
    admin: args.admin,
    categoryId: data.id,
    input: args.input,
  });

  return data;
}

export async function updateFaqCategory(args: {
  admin: AdminClient;
  categoryId: string;
  input: FaqCategoryInput;
}) {
  const { data, error } = await args.admin
    .from('faq_categories')
    .update({
      slug: args.input.slug,
      icon: args.input.icon,
      sort_order: args.input.sort_order,
      is_active: args.input.is_active,
    })
    .eq('id', args.categoryId)
    .select('*')
    .single();

  if (error) {
    if (isPgConflict(error)) {
      throw new Error('A category with this slug already exists.');
    }
    throw error;
  }

  await upsertFaqCategoryTranslations({
    admin: args.admin,
    categoryId: args.categoryId,
    input: args.input,
  });

  return data;
}

export async function createFaqItem(args: {
  admin: AdminClient;
  input: FaqItemInput;
}) {
  const { data, error } = await args.admin
    .from('faq_items')
    .insert({
      category_id: args.input.category_id,
      slug: args.input.slug,
      sort_order: args.input.sort_order,
      is_active: args.input.is_active,
      is_featured: args.input.is_featured,
    })
    .select('*')
    .single();

  if (error) {
    if (isPgConflict(error)) {
      throw new Error('An FAQ with this slug already exists.');
    }
    throw error;
  }

  await upsertFaqItemTranslations({
    admin: args.admin,
    itemId: data.id,
    input: args.input,
  });

  return data;
}

export async function updateFaqItem(args: {
  admin: AdminClient;
  itemId: string;
  input: FaqItemInput;
}) {
  const { data, error } = await args.admin
    .from('faq_items')
    .update({
      category_id: args.input.category_id,
      slug: args.input.slug,
      sort_order: args.input.sort_order,
      is_active: args.input.is_active,
      is_featured: args.input.is_featured,
    })
    .eq('id', args.itemId)
    .select('*')
    .single();

  if (error) {
    if (isPgConflict(error)) {
      throw new Error('An FAQ with this slug already exists.');
    }
    throw error;
  }

  await upsertFaqItemTranslations({
    admin: args.admin,
    itemId: args.itemId,
    input: args.input,
  });

  return data;
}

export async function deleteFaqCategory(args: {
  admin: AdminClient;
  categoryId: string;
}) {
  const { error } = await args.admin
    .from('faq_categories')
    .delete()
    .eq('id', args.categoryId);

  if (error) {
    throw error;
  }
}

export async function deleteFaqItem(args: {
  admin: AdminClient;
  itemId: string;
}) {
  const { error } = await args.admin
    .from('faq_items')
    .delete()
    .eq('id', args.itemId);

  if (error) {
    throw error;
  }
}

export async function reorderFaqCategories(args: {
  admin: AdminClient;
  ids: string[];
}) {
  for (const [index, id] of args.ids.entries()) {
    const { error } = await args.admin
      .from('faq_categories')
      .update({ sort_order: index * 10 })
      .eq('id', id)
      .select('id')
      .single();

    if (error) {
      throw error;
    }
  }
}

export async function reorderFaqItems(args: {
  admin: AdminClient;
  ids: string[];
}) {
  for (const [index, id] of args.ids.entries()) {
    const { error } = await args.admin
      .from('faq_items')
      .update({ sort_order: index * 10 })
      .eq('id', id)
      .select('id')
      .single();

    if (error) {
      throw error;
    }
  }
}

export async function loadFaqCategoryQuestionCount(args: {
  admin: AdminClient;
  categoryId: string;
}) {
  const { count, error } = await args.admin
    .from('faq_items')
    .select('*', { count: 'exact', head: true })
    .eq('category_id', args.categoryId);

  if (error) {
    throw error;
  }

  return count || 0;
}

export async function listFaqCategoriesForApi() {
  const data = await getAdminFaqDashboardData();
  return data.categories;
}

export async function listFaqItemsForApi() {
  const data = await getAdminFaqDashboardData();
  return data.items;
}

export function mergeCategoryInputWithExisting(args: {
  input: Partial<FaqCategoryInput>;
  existing?: FaqCategoryInput | null;
}) {
  const base = args.existing || {
    slug: '',
    icon: null,
    sort_order: 0,
    is_active: true,
    translations: createEmptyFaqCategoryTranslations(),
  };

  return {
    ...base,
    ...args.input,
    translations: {
      ...base.translations,
      ...args.input.translations,
    },
  } satisfies Partial<FaqCategoryInput>;
}

export function mergeItemInputWithExisting(args: {
  input: Partial<FaqItemInput>;
  existing?: FaqItemInput | null;
}) {
  const base = args.existing || {
    category_id: '',
    slug: '',
    sort_order: 0,
    is_active: true,
    is_featured: false,
    translations: createEmptyFaqItemTranslations(),
  };

  return {
    ...base,
    ...args.input,
    translations: {
      ...base.translations,
      ...args.input.translations,
    },
  } satisfies Partial<FaqItemInput>;
}
