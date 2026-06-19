import 'server-only';

import { cache } from 'react';
import { unstable_noStore as noStore } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  deriveCmsSeoDescription,
  deriveCmsSeoTitle,
  getCmsPageNavigationLabel,
  sanitizeRichTextHtml,
  type CmsPageRecord,
} from '@/lib/cms-pages';

export type PublicCmsPage = CmsPageRecord & {
  navigation_label_resolved: string;
  seo_title_resolved: string;
  seo_description_resolved: string;
  content_html_sanitized: string;
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

function normalizePage(page: CmsPageRecord | null) {
  if (!page) {
    return null;
  }

  return {
    ...page,
    navigation_label_resolved: getCmsPageNavigationLabel(page),
    seo_title_resolved: deriveCmsSeoTitle(page),
    seo_description_resolved: deriveCmsSeoDescription(page),
    content_html_sanitized: sanitizeRichTextHtml(page.content_html || ''),
  } satisfies PublicCmsPage;
}

async function readPublicCmsPageWithAnonClient(slug: string) {
  const supabase = await createAnonClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('cms_pages')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return (data as CmsPageRecord | null) || null;
}

async function readPublicCmsPageWithAdminClient(slug: string) {
  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  const { data, error } = await admin
    .from('cms_pages')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  const page = (data as CmsPageRecord | null) || null;
  if (!page || page.status !== 'published' || !page.is_enabled) {
    return page;
  }

  return page;
}

async function readPublicCmsPagesWithAnonClient() {
  const supabase = await createAnonClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('cms_pages')
    .select('*')
    .eq('status', 'published')
    .eq('is_enabled', true)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });

  if (error) {
    throw error;
  }

  return (data as CmsPageRecord[] | null) || [];
}

async function readPublicCmsPagesWithAdminClient() {
  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  const { data, error } = await admin
    .from('cms_pages')
    .select('*')
    .eq('status', 'published')
    .eq('is_enabled', true)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });

  if (error) {
    throw error;
  }

  return (data as CmsPageRecord[] | null) || [];
}

export const getPublicCmsPageBySlug = cache(async (slug: string): Promise<PublicCmsPage | null> => {
  noStore();

  try {
    const anonPage = await readPublicCmsPageWithAnonClient(slug);
    if (anonPage) {
      return normalizePage(anonPage);
    }
  } catch {}

  try {
    const adminPage = await readPublicCmsPageWithAdminClient(slug);
    if (adminPage && adminPage.status === 'published' && adminPage.is_enabled) {
      return normalizePage(adminPage);
    }
  } catch {}

  return null;
});

export const getAnyCmsPageBySlug = cache(async (slug: string): Promise<CmsPageRecord | null> => {
  noStore();

  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  const { data, error } = await admin
    .from('cms_pages')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return (data as CmsPageRecord | null) || null;
});

export const listPublicCmsPages = cache(async (): Promise<PublicCmsPage[]> => {
  noStore();

  try {
    const anonPages = await readPublicCmsPagesWithAnonClient();
    if (anonPages) {
      return anonPages.map((page) => normalizePage(page)!).filter(Boolean);
    }
  } catch {}

  try {
    const adminPages = await readPublicCmsPagesWithAdminClient();
    if (adminPages) {
      return adminPages.map((page) => normalizePage(page)!).filter(Boolean);
    }
  } catch {}

  return [];
});
