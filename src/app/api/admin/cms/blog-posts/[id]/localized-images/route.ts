import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import {
  deleteBlogLocalizedImageOverride,
} from '@/lib/blog-translate-server';
import { isSupportedLanguage, type SupportedLanguage } from '@/i18n/registry';

type LocalizedImageMap = Partial<
  Record<
    SupportedLanguage,
    { cover_image_url: string; seo_image_url: string; twitter_image_url: string }
  >
>;

async function requireAdminUser() {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false as const,
      response: applySupabaseCookies(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        cookieMutations
      ),
    };
  }

  if (user.app_metadata?.role !== 'admin') {
    return {
      ok: false as const,
      response: applySupabaseCookies(
        NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
        cookieMutations
      ),
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false as const,
      response: applySupabaseCookies(
        NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 }),
        cookieMutations
      ),
    };
  }

  return { ok: true as const, admin, cookieMutations };
}

async function loadBlogPostOr404(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  id: string
) {
  const { data, error } = await admin
    .from('cms_pages')
    .select('id')
    .eq('id', id)
    .eq('content_type', 'blog')
    .maybeSingle();
  if (error) throw error;
  return data ? (data as { id: string }) : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser();
  if (!auth.ok) return auth.response;
  const { admin, cookieMutations } = auth;
  const { id } = await params;

  try {
    const existing = await loadBlogPostOr404(admin, id);
    if (!existing) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Blog post not found.' }, { status: 404 }),
        cookieMutations
      );
    }

    const { data, error } = await admin
      .from('cms_page_localized_images')
      .select('language_code,cover_image_url,seo_image_url,twitter_image_url')
      .eq('page_id', id);

    if (error) throw error;

    const result: LocalizedImageMap = {};
    for (const row of (data as any[] | null) || []) {
      const lang = row.language_code;
      if (!isSupportedLanguage(lang)) continue;
      const hasAny =
        String(row.cover_image_url || '').trim() ||
        String(row.seo_image_url || '').trim() ||
        String(row.twitter_image_url || '').trim();
      if (!hasAny) continue;
      result[lang] = {
        cover_image_url: String(row.cover_image_url || '').trim(),
        seo_image_url: String(row.seo_image_url || '').trim(),
        twitter_image_url: String(row.twitter_image_url || '').trim(),
      };
    }

    return applySupabaseCookies(
      NextResponse.json({ localized_images: result }, { status: 200 }),
      cookieMutations
    );
  } catch (error: any) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: error?.message || 'Failed to load localized images.' },
        { status: 500 }
      ),
      cookieMutations
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser();
  if (!auth.ok) return auth.response;
  const { admin, cookieMutations } = auth;
  const { id } = await params;

  try {
    const existing = await loadBlogPostOr404(admin, id);
    if (!existing) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Blog post not found.' }, { status: 404 }),
        cookieMutations
      );
    }

    const url = new URL(request.url);
    const lang = url.searchParams.get('lang');
    if (!isSupportedLanguage(lang)) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Invalid or missing language parameter.' }, { status: 400 }),
        cookieMutations
      );
    }

    await deleteBlogLocalizedImageOverride(admin, id, lang);

    return applySupabaseCookies(
      NextResponse.json({ success: true, language: lang }, { status: 200 }),
      cookieMutations
    );
  } catch (error: any) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: error?.message || 'Failed to delete localized image override.' },
        { status: 500 }
      ),
      cookieMutations
    );
  }
}
