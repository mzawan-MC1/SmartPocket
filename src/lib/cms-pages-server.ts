import 'server-only';

import { cache } from 'react';
import { unstable_noStore as noStore } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  deriveCmsExcerpt,
  deriveCmsOgDescription,
  deriveCmsOgTitle,
  deriveCmsSeoDescription,
  deriveCmsSeoKeywords,
  deriveCmsSeoTitle,
  deriveCmsTwitterDescription,
  deriveCmsTwitterTitle,
  getCmsPageNavigationLabel,
  sanitizeRichTextHtml,
  type CmsContentType,
  type CmsPageRecord,
} from '@/lib/cms-pages';

export type PublicCmsPage = CmsPageRecord & {
  navigation_label_resolved: string;
  excerpt_resolved: string;
  seo_title_resolved: string;
  seo_description_resolved: string;
  seo_keywords_resolved: string[];
  og_title_resolved: string;
  og_description_resolved: string;
  twitter_title_resolved: string;
  twitter_description_resolved: string;
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
    excerpt_resolved: deriveCmsExcerpt(page),
    seo_title_resolved: deriveCmsSeoTitle(page),
    seo_description_resolved: deriveCmsSeoDescription(page),
    seo_keywords_resolved: deriveCmsSeoKeywords(page),
    og_title_resolved: deriveCmsOgTitle(page),
    og_description_resolved: deriveCmsOgDescription(page),
    twitter_title_resolved: deriveCmsTwitterTitle(page),
    twitter_description_resolved: deriveCmsTwitterDescription(page),
    content_html_sanitized: sanitizeRichTextHtml(page.content_html || ''),
  } satisfies PublicCmsPage;
}

async function readPublicCmsPageWithAnonClient(slug: string, contentType: CmsContentType) {
  const supabase = await createAnonClient();
  if (!supabase) {
    return null;
  }

  let query = supabase
    .from('cms_pages')
    .select('*')
    .eq('slug', slug);

  if (contentType === 'blog') {
    query = query.eq('content_type', 'blog');
  } else if (contentType === 'page') {
    query = query.eq('content_type', 'page');
  }

  const { data, error } = await query.maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return (data as CmsPageRecord | null) || null;
}

async function readPublicCmsPageWithAdminClient(slug: string, contentType: CmsContentType) {
  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  let query = admin
    .from('cms_pages')
    .select('*')
    .eq('slug', slug);

  if (contentType === 'blog') {
    query = query.eq('content_type', 'blog');
  } else if (contentType === 'page') {
    query = query.eq('content_type', 'page');
  }

  const { data, error } = await query.maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  const page = (data as CmsPageRecord | null) || null;
  if (!page || page.status !== 'published' || !page.is_enabled) {
    return page;
  }

  return page;
}

async function readPublicCmsPagesWithAnonClient(contentType: CmsContentType) {
  const supabase = await createAnonClient();
  if (!supabase) {
    return null;
  }

  let query = supabase
    .from('cms_pages')
    .select('*')
    .eq('status', 'published')
    .eq('is_enabled', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });

  if (contentType === 'blog') {
    query = query.eq('content_type', 'blog');
  } else if (contentType === 'page') {
    query = query.eq('content_type', 'page');
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data as CmsPageRecord[] | null) || [];
}

async function readPublicCmsPagesWithAdminClient(contentType: CmsContentType) {
  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  let query = admin
    .from('cms_pages')
    .select('*')
    .eq('status', 'published')
    .eq('is_enabled', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });

  if (contentType === 'blog') {
    query = query.eq('content_type', 'blog');
  } else if (contentType === 'page') {
    query = query.eq('content_type', 'page');
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data as CmsPageRecord[] | null) || [];
}

async function getPublicCmsContentBySlugInternal(
  slug: string,
  contentType: CmsContentType
): Promise<PublicCmsPage | null> {
  noStore();

  try {
    const anonPage = await readPublicCmsPageWithAnonClient(slug, contentType);
    if (anonPage) {
      return normalizePage(anonPage);
    }
  } catch {}

  try {
    const adminPage = await readPublicCmsPageWithAdminClient(slug, contentType);
    if (adminPage && adminPage.status === 'published' && adminPage.is_enabled) {
      return normalizePage(adminPage);
    }
  } catch {}

  return null;
}

export const getPublicCmsPageBySlug = cache(async (slug: string): Promise<PublicCmsPage | null> =>
  getPublicCmsContentBySlugInternal(slug, 'page')
);

export const getPublicBlogPostBySlug = cache(async (slug: string): Promise<PublicCmsPage | null> =>
  getPublicCmsContentBySlugInternal(slug, 'blog')
);

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

async function listPublicCmsContentInternal(contentType: CmsContentType): Promise<PublicCmsPage[]> {
  noStore();

  try {
    const anonPages = await readPublicCmsPagesWithAnonClient(contentType);
    if (anonPages) {
      return anonPages.map((page) => normalizePage(page)!).filter(Boolean);
    }
  } catch {}

  try {
    const adminPages = await readPublicCmsPagesWithAdminClient(contentType);
    if (adminPages) {
      return adminPages.map((page) => normalizePage(page)!).filter(Boolean);
    }
  } catch {}

  return [];
}

export const listPublicCmsPages = cache(async (): Promise<PublicCmsPage[]> =>
  listPublicCmsContentInternal('page')
);

export const listPublicBlogPosts = cache(async (): Promise<PublicCmsPage[]> =>
  listPublicCmsContentInternal('blog')
);

export const listFeaturedBlogPosts = cache(async (): Promise<PublicCmsPage[]> => {
  const posts = await listPublicBlogPosts();
  return posts.filter((post) => post.is_featured);
});

export async function listRelatedBlogPosts(
  currentPost: Pick<PublicCmsPage, 'id' | 'category' | 'tags'>,
  limit = 3
): Promise<PublicCmsPage[]> {
  const posts = await listPublicBlogPosts();
  const currentTags = new Set((currentPost.tags || []).map((tag) => tag.toLowerCase()));

  return posts
    .filter((post) => post.id !== currentPost.id)
    .map((post) => {
      const sharedTagCount = (post.tags || []).reduce(
        (count, tag) => count + (currentTags.has(tag.toLowerCase()) ? 1 : 0),
        0
      );
      const sameCategory =
        currentPost.category &&
        post.category &&
        currentPost.category.trim().toLowerCase() === post.category.trim().toLowerCase();

      return {
        post,
        score: (sameCategory ? 5 : 0) + sharedTagCount,
      };
    })
    .filter((entry) => entry.score > 0 || Boolean(entry.post.is_featured))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.post);
}
