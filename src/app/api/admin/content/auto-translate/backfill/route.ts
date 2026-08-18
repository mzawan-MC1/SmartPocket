import 'server-only';

import { NextResponse } from 'next/server';
import { requireAdminRouteUser } from '@/lib/support-server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import {
  buildBlogSourceBundle,
  scheduleBlogTranslations,
} from '@/lib/blog-translate-server';
import {
  autoTranslateFaqCategory,
  autoTranslateFaqItem,
  loadFaqCategoryInputOrNull,
  loadFaqItemInputOrNull,
} from '@/lib/faqs-admin-server';
import {
  buildDocumentationSourceBundle,
  scheduleDocumentationTranslations,
} from '@/lib/documentation-translate-server';
import type { DocumentationArticleRecord } from '@/lib/documentation';
import type { CmsPageRecord } from '@/lib/cms-pages';
import { CONTENT_TRANSLATION_ENABLED_LANGS } from '@/lib/content-translate-server';

export const maxDuration = 60;

type BackfillScope = 'all' | 'blog' | 'faq' | 'documentation';

type BackfillCursor = {
  blogCursor?: string;
  faqCategoryCursor?: string;
  faqItemCursor?: string;
  documentationCursor?: string;
};

type ScheduleFailure = {
  type: 'blog' | 'faq_category' | 'faq_item' | 'documentation_article';
  id: string;
  message: string;
};

type ScheduledWorkItem = {
  type: 'blog' | 'faq_item' | 'faq_category' | 'documentation_article';
  id: string;
  language: string;
  parentEnSourceHash?: string;
};

type BackfillRequest = {
  scope?: BackfillScope;
  cursor?: BackfillCursor;
  batchSize?: number;
};

const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 10;

function sanitizeBatchSize(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n) || n < 1) return DEFAULT_BATCH_SIZE;
  return Math.min(Math.floor(n), MAX_BATCH_SIZE);
}

function isValidScope(v: unknown): v is BackfillScope {
  return v === 'all' || v === 'blog' || v === 'faq' || v === 'documentation';
}

function toIsoCursor(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
}

const WORK_STATUSES = ['pending', 'failed', 'missing', 'outdated'] as const;

export async function POST(request: Request) {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) return auth.response;

  try {
    const rawBody = (await request.json()) as BackfillRequest;
    const scope: BackfillScope = isValidScope(rawBody.scope) ? rawBody.scope : 'all';
    const batchSize = sanitizeBatchSize(rawBody.batchSize);
    const cursor: BackfillCursor = {
      blogCursor: toIsoCursor(rawBody.cursor?.blogCursor),
      faqCategoryCursor: toIsoCursor(rawBody.cursor?.faqCategoryCursor),
      faqItemCursor: toIsoCursor(rawBody.cursor?.faqItemCursor),
      documentationCursor: toIsoCursor(rawBody.cursor?.documentationCursor),
    };

    const nextCursor: BackfillCursor = {};
    const failures: ScheduleFailure[] = [];
    let completedScanCount = 0;
    let blogRemainingEstimate = 0;
    let faqCategoryRemainingEstimate = 0;
    let faqItemRemainingEstimate = 0;
    let documentationRemainingEstimate = 0;

    const blogPageIds: string[] = [];
    const faqCategoryIds: string[] = [];
    const faqItemIds: string[] = [];
    const documentationIds: string[] = [];

    if (scope === 'all' || scope === 'blog') {
      let query = auth.admin
        .from('cms_pages')
        .select('*', { count: 'exact' })
        .eq('content_type', 'blog')
        .order('created_at', { ascending: true })
        .limit(batchSize + 1);
      if (cursor.blogCursor) {
        query = query.gt('created_at', cursor.blogCursor);
      }
      const { data: blogData, error: blogErr, count } = await query;
      if (blogErr) throw blogErr;

      const blogRows = (blogData as CmsPageRecord[] | null) || [];
      const page = blogRows.slice(0, batchSize);
      const hasMore = blogRows.length > batchSize;

      if (hasMore && page.length > 0) {
        nextCursor.blogCursor = page[page.length - 1].created_at;
      }
      blogRemainingEstimate = count ?? 0;

      for (const post of page) {
        completedScanCount += 1;
        blogPageIds.push(post.id);
        try {
          const bundle = buildBlogSourceBundle({
            title: post.title,
            excerpt: post.excerpt,
            content_html: post.content_html,
            category: post.category,
            tags: post.tags,
            cover_image_alt: post.cover_image_alt,
            seo_title: post.seo_title,
            seo_description: post.seo_description,
            seo_keywords: post.seo_keywords,
            og_title: post.og_title,
            og_description: post.og_description,
            twitter_title: post.twitter_title,
            twitter_description: post.twitter_description,
          });
          await scheduleBlogTranslations(auth.admin, post.id, bundle, { regenerateAll: false });
        } catch (err: any) {
          failures.push({
            type: 'blog',
            id: post.id,
            message: err instanceof Error ? String(err.message || 'Scheduling failed.') : 'Scheduling failed.',
          });
        }
      }
    }

    if (scope === 'all' || scope === 'faq') {
      let catQuery = auth.admin
        .from('faq_categories')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: true })
        .limit(batchSize + 1);
      if (cursor.faqCategoryCursor) {
        catQuery = catQuery.gt('created_at', cursor.faqCategoryCursor);
      }
      const { data: catData, error: catErr, count: catCount } = await catQuery;
      if (catErr) throw catErr;

      const catRows = (catData as any[] | null) || [];
      const catPage = catRows.slice(0, batchSize);
      const catHasMore = catRows.length > batchSize;
      if (catHasMore && catPage.length > 0) {
        nextCursor.faqCategoryCursor = catPage[catPage.length - 1].created_at;
      }
      faqCategoryRemainingEstimate = catCount ?? 0;

      for (const cat of catPage) {
        completedScanCount += 1;
        faqCategoryIds.push(cat.id);
        try {
          const input = await loadFaqCategoryInputOrNull(auth.admin, cat.id);
          if (!input) {
            failures.push({
              type: 'faq_category',
              id: cat.id,
              message: 'FAQ category not found while loading input.',
            });
            continue;
          }
          await autoTranslateFaqCategory(auth.admin, cat.id, input, { regenerateAll: false });
        } catch (err: any) {
          failures.push({
            type: 'faq_category',
            id: cat.id,
            message: err instanceof Error ? String(err.message || 'Scheduling failed.') : 'Scheduling failed.',
          });
        }
      }

      let itemQuery = auth.admin
        .from('faq_items')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: true })
        .limit(batchSize + 1);
      if (cursor.faqItemCursor) {
        itemQuery = itemQuery.gt('created_at', cursor.faqItemCursor);
      }
      const { data: itemData, error: itemErr, count: itemCount } = await itemQuery;
      if (itemErr) throw itemErr;

      const itemRows = (itemData as any[] | null) || [];
      const itemPage = itemRows.slice(0, batchSize);
      const itemHasMore = itemRows.length > batchSize;
      if (itemHasMore && itemPage.length > 0) {
        nextCursor.faqItemCursor = itemPage[itemPage.length - 1].created_at;
      }
      faqItemRemainingEstimate = itemCount ?? 0;

      for (const item of itemPage) {
        completedScanCount += 1;
        faqItemIds.push(item.id);
        try {
          const input = await loadFaqItemInputOrNull(auth.admin, item.id);
          if (!input) {
            failures.push({
              type: 'faq_item',
              id: item.id,
              message: 'FAQ item not found while loading input.',
            });
            continue;
          }
          await autoTranslateFaqItem(auth.admin, item.id, input, { regenerateAll: false });
        } catch (err: any) {
          failures.push({
            type: 'faq_item',
            id: item.id,
            message: err instanceof Error ? String(err.message || 'Scheduling failed.') : 'Scheduling failed.',
          });
        }
      }
    }

    if (scope === 'all' || scope === 'documentation') {
      let docQuery = auth.admin
        .from('documentation_articles')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: true })
        .limit(batchSize + 1);
      if (cursor.documentationCursor) {
        docQuery = docQuery.gt('created_at', cursor.documentationCursor);
      }
      const { data: docData, error: docErr, count: docCount } = await docQuery;
      if (docErr) throw docErr;

      const docRows = (docData as DocumentationArticleRecord[] | null) || [];
      const docPage = docRows.slice(0, batchSize);
      const docHasMore = docRows.length > batchSize;
      if (docHasMore && docPage.length > 0) {
        nextCursor.documentationCursor = docPage[docPage.length - 1].created_at;
      }
      documentationRemainingEstimate = docCount ?? 0;

      for (const article of docPage) {
        completedScanCount += 1;
        documentationIds.push(article.id);
        try {
          const bundle = buildDocumentationSourceBundle({
            title: article.title,
            summary: article.summary,
            content_html: article.content_html,
            category: article.category,
          });
          await scheduleDocumentationTranslations(auth.admin, article.id, bundle, { regenerateAll: false });
        } catch (err: any) {
          failures.push({
            type: 'documentation_article',
            id: article.id,
            message: err instanceof Error ? String(err.message || 'Scheduling failed.') : 'Scheduling failed.',
          });
        }
      }
    }

    const scheduledWorkItems: ScheduledWorkItem[] = [];

    if (blogPageIds.length > 0) {
      const { data: blogTranslations, error: blogTransErr } = await auth.admin
        .from('cms_page_translations')
        .select('page_id, language_code, cms_pages!inner(en_source_version_hash)')
        .in('page_id', blogPageIds)
        .in('translation_status', WORK_STATUSES)
        .in('language_code', CONTENT_TRANSLATION_ENABLED_LANGS as readonly string[]);
      if (!blogTransErr && blogTranslations) {
        for (const row of blogTranslations as any[]) {
          if (!(CONTENT_TRANSLATION_ENABLED_LANGS as readonly string[]).includes(String(row.language_code || ''))) continue;
          scheduledWorkItems.push({
            type: 'blog',
            id: row.page_id,
            language: row.language_code,
            parentEnSourceHash: row.cms_pages?.en_source_version_hash,
          });
        }
      }
    }

    if (faqCategoryIds.length > 0) {
      const { data: catTranslations, error: catTransErr } = await auth.admin
        .from('faq_category_translations')
        .select('category_id, language_code, faq_categories!inner(en_source_version_hash)')
        .in('category_id', faqCategoryIds)
        .in('translation_status', WORK_STATUSES)
        .in('language_code', CONTENT_TRANSLATION_ENABLED_LANGS as readonly string[]);
      if (!catTransErr && catTranslations) {
        for (const row of catTranslations as any[]) {
          if (!(CONTENT_TRANSLATION_ENABLED_LANGS as readonly string[]).includes(String(row.language_code || ''))) continue;
          scheduledWorkItems.push({
            type: 'faq_category',
            id: row.category_id,
            language: row.language_code,
            parentEnSourceHash: row.faq_categories?.en_source_version_hash,
          });
        }
      }
    }

    if (faqItemIds.length > 0) {
      const { data: itemTranslations, error: itemTransErr } = await auth.admin
        .from('faq_item_translations')
        .select('item_id, language_code, faq_items!inner(en_source_version_hash)')
        .in('item_id', faqItemIds)
        .in('translation_status', WORK_STATUSES)
        .in('language_code', CONTENT_TRANSLATION_ENABLED_LANGS as readonly string[]);
      if (!itemTransErr && itemTranslations) {
        for (const row of itemTranslations as any[]) {
          if (!(CONTENT_TRANSLATION_ENABLED_LANGS as readonly string[]).includes(String(row.language_code || ''))) continue;
          scheduledWorkItems.push({
            type: 'faq_item',
            id: row.item_id,
            language: row.language_code,
            parentEnSourceHash: row.faq_items?.en_source_version_hash,
          });
        }
      }
    }

    if (documentationIds.length > 0) {
      const { data: docTranslations, error: docTransErr } = await auth.admin
        .from('documentation_translations')
        .select('article_id, language_code, documentation_articles!inner(en_source_version_hash)')
        .in('article_id', documentationIds)
        .in('translation_status', WORK_STATUSES)
        .in('language_code', CONTENT_TRANSLATION_ENABLED_LANGS as readonly string[]);
      if (!docTransErr && docTranslations) {
        for (const row of docTranslations as any[]) {
          if (!(CONTENT_TRANSLATION_ENABLED_LANGS as readonly string[]).includes(String(row.language_code || ''))) continue;
          scheduledWorkItems.push({
            type: 'documentation_article',
            id: row.article_id,
            language: row.language_code,
            parentEnSourceHash: row.documentation_articles?.en_source_version_hash,
          });
        }
      }
    }

    const totalRemainingEstimate =
      blogRemainingEstimate + faqCategoryRemainingEstimate + faqItemRemainingEstimate + documentationRemainingEstimate;

    return applySupabaseCookies(
      NextResponse.json(
        {
          scope,
          batchSize,
          completedScanCount,
          totalRemainingEstimate,
          nextCursor,
          failures,
          scheduledWorkItems,
        },
        { status: 200 }
      ),
      auth.cookieMutations
    );
  } catch (e: any) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: e?.message || 'Backfill batch failed.' },
        { status: 500 }
      ),
      auth.cookieMutations
    );
  }
}
