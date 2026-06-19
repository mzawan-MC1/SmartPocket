import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import {
  normalizeCmsPagePayload,
  sanitizeRichTextHtml,
  type CmsPageInput,
  type CmsPageRecord,
} from '@/lib/cms-pages';

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

async function ensureUniqueSlug(admin: NonNullable<ReturnType<typeof createAdminClient>>, slug: string) {
  const { data, error } = await admin
    .from('cms_pages')
    .select('id')
    .ilike('slug', slug)
    .limit(1);

  if (error) {
    throw error;
  }

  return !data || data.length === 0;
}

function serializePage(page: CmsPageRecord) {
  return {
    ...page,
    content_html: sanitizeRichTextHtml(page.content_html || ''),
    can_delete: !(page.is_protected_system_page && !page.allow_delete),
  };
}

export async function GET() {
  const auth = await requireAdminUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { admin, cookieMutations } = auth;
  const { data, error } = await admin
    .from('cms_pages')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('updated_at', { ascending: false });

  if (error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to load CMS pages.' }, { status: 500 }),
      cookieMutations
    );
  }

  return applySupabaseCookies(
    NextResponse.json({ pages: (data as CmsPageRecord[]).map(serializePage) }, { status: 200 }),
    cookieMutations
  );
}

export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { admin, cookieMutations } = auth;

  try {
    const body = (await request.json()) as Partial<CmsPageInput>;
    const payload = normalizeCmsPagePayload(body);

    if (!payload.title) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Page title is required.' }, { status: 400 }),
        cookieMutations
      );
    }

    if (!payload.slug) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Slug is required.' }, { status: 400 }),
        cookieMutations
      );
    }

    const isUnique = await ensureUniqueSlug(admin, payload.slug);
    if (!isUnique) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'A page with this slug already exists.' }, { status: 409 }),
        cookieMutations
      );
    }

    const insertPayload = {
      ...payload,
      published_at: payload.status === 'published' ? new Date().toISOString() : null,
    };

    const { data, error } = await admin
      .from('cms_pages')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return applySupabaseCookies(
      NextResponse.json({ page: serializePage(data as CmsPageRecord) }, { status: 201 }),
      cookieMutations
    );
  } catch (error: any) {
    return applySupabaseCookies(
      NextResponse.json({ error: error?.message || 'Failed to create CMS page.' }, { status: 500 }),
      cookieMutations
    );
  }
}
