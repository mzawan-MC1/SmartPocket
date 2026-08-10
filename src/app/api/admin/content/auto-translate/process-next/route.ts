import 'server-only';

import { NextResponse } from 'next/server';
import { requireAdminRouteUser } from '@/lib/support-server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildBlogSourceBundle,
  processOneBlogTranslation,
} from '@/lib/blog-translate-server';
import {
  loadFaqCategoryInputOrNull,
  loadFaqItemInputOrNull,
  processOneFaqCategoryTranslation,
  processOneFaqItemTranslation,
} from '@/lib/faqs-admin-server';
import type { CmsPageRecord } from '@/lib/cms-pages';
import type { SupportedLanguage } from '@/i18n/registry';
import {
  CONTENT_TRANSLATION_ENABLED_LANGS,
} from '@/lib/content-translate-server';

export const maxDuration = 60;

type WorkItemType = 'blog' | 'faq_item' | 'faq_category';

type WorkItem = {
  type: WorkItemType;
  id: string;
  language: string;
};

type CompletedWorkItem = WorkItem & {
  success: boolean;
  errorMessage: string | null;
  attemptId: string;
  errorStage: string | null;
};

function newAttemptId(): string {
  const h = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 12; i++) s += h[Math.floor(Math.random() * 16)];
  return 'txl_' + s;
}

function isValidWorkItem(v: unknown): v is WorkItem {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  if (obj.type !== 'blog' && obj.type !== 'faq_item' && obj.type !== 'faq_category') return false;
  if (typeof obj.id !== 'string' || !obj.id.trim()) return false;
  if (typeof obj.language !== 'string' || !obj.language.trim()) return false;
  if (!(CONTENT_TRANSLATION_ENABLED_LANGS as readonly string[]).includes(obj.language)) return false;
  return true;
}

export async function POST(request: Request) {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as { item?: unknown };

    if (!isValidWorkItem(body.item)) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'Missing or invalid item format or unsupported language.' },
          { status: 400 }
        ),
        auth.cookieMutations
      );
    }

    const item = body.item as WorkItem;
    const language = item.language as SupportedLanguage;
    let success = false;
    let errorMessage: string | null = null;
    let attemptId: string = newAttemptId();
    let errorStage: string | null = null;

    try {
      const admin = createAdminClient();
      if (!admin) throw new Error('Supabase service role is not configured.');

      if (item.type === 'blog') {
        const { data: pageRow, error: pageErr } = await admin
          .from('cms_pages')
          .select('*')
          .eq('id', item.id)
          .maybeSingle();
        if (pageErr) throw pageErr;
        if (!pageRow) throw new Error('Blog page not found.');
        const page = pageRow as CmsPageRecord;
        const bundle = buildBlogSourceBundle({
          title: page.title,
          excerpt: page.excerpt,
          content_html: page.content_html,
          category: page.category,
          tags: page.tags,
          cover_image_alt: page.cover_image_alt,
          seo_title: page.seo_title,
          seo_description: page.seo_description,
          seo_keywords: page.seo_keywords,
          og_title: page.og_title,
          og_description: page.og_description,
          twitter_title: page.twitter_title,
          twitter_description: page.twitter_description,
        });
        const result = await processOneBlogTranslation(admin, item.id, language, bundle);
        attemptId = result.attemptId;
        errorStage = result.errorStage;
        success = !result.errorMessage;
        errorMessage = result.errorMessage ?? null;
      } else if (item.type === 'faq_category') {
        const input = await loadFaqCategoryInputOrNull(admin, item.id);
        if (!input) throw new Error('FAQ category not found.');
        const result = await processOneFaqCategoryTranslation(admin, item.id, language, input);
        attemptId = result.attemptId;
        errorStage = result.errorStage;
        success = !result.errorMessage;
        errorMessage = result.errorMessage ?? null;
      } else if (item.type === 'faq_item') {
        const input = await loadFaqItemInputOrNull(admin, item.id);
        if (!input) throw new Error('FAQ item not found.');
        const result = await processOneFaqItemTranslation(admin, item.id, language, input);
        attemptId = result.attemptId;
        errorStage = result.errorStage;
        success = !result.errorMessage;
        errorMessage = result.errorMessage ?? null;
      }
    } catch (err: any) {
      success = false;
      const rawMsg = err instanceof Error ? String(err.message || 'Processing failed.') : 'Processing failed.';
      if (!errorMessage) {
        const stageFromMsg =
          rawMsg.includes('provider_request_failed') ? 'provider_request_failed' :
          rawMsg.includes('provider_returned_no_text') ? 'provider_returned_no_text' :
          rawMsg.includes('invalid_json') ? 'invalid_json' :
          rawMsg.includes('schema_validation_failed') ? 'schema_validation_failed' :
          rawMsg.includes('unsupported_gateway_response_shape') ? 'unsupported_gateway_response_shape' :
          rawMsg.includes('required_translation_fields_empty') ? 'required_translation_fields_empty' :
          rawMsg.includes('disabled_or_empty_input') ? 'disabled_or_empty_input' :
          rawMsg.includes('provider_timeout') ? 'provider_timeout' :
          rawMsg.includes('abort_or_timeout') ? 'abort_or_timeout' :
          rawMsg.includes('database_upsert_failed') ? 'database_upsert_failed' :
          null;
        errorStage = errorStage || stageFromMsg || 'required_translation_fields_empty';
        const attemptIdFromMsg = rawMsg.match(/\[txl_[0-9a-f]{12}\]/)?.[0]?.replace(/[\[\]]/g, '');
        if (attemptIdFromMsg) attemptId = attemptIdFromMsg;
        if (rawMsg.startsWith('[txl_')) {
          errorMessage = rawMsg.slice(0, 500);
        } else {
          errorMessage = `[${attemptId}] ${errorStage}: ${rawMsg}`.slice(0, 500);
        }
      }
    }

    const completedItem: CompletedWorkItem = {
      type: item.type,
      id: item.id,
      language: item.language,
      success,
      errorMessage,
      attemptId,
      errorStage,
    };

    return applySupabaseCookies(
      NextResponse.json(
        {
          completedItem,
          remainingWorkCount: 0,
          anyFailures: !success,
        },
        { status: 200 }
      ),
      auth.cookieMutations
    );
  } catch (e: any) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: e?.message || 'Process next failed.' },
        { status: 500 }
      ),
      auth.cookieMutations
    );
  }
}
