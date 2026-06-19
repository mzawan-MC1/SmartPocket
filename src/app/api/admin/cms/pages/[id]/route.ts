import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import {
  isReservedCmsSlug,
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

function serializePage(page: CmsPageRecord) {
  return {
    ...page,
    content_html: sanitizeRichTextHtml(page.content_html || ''),
    can_delete: !(page.is_protected_system_page && !page.allow_delete),
  };
}

async function loadPageOr404(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  id: string
) {
  const { data, error } = await admin
    .from('cms_pages')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as CmsPageRecord | null) || null;
}

async function ensureUniqueSlug(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  slug: string,
  currentId: string
) {
  const { data, error } = await admin
    .from('cms_pages')
    .select('id')
    .ilike('slug', slug);

  if (error) {
    throw error;
  }

  return !(data || []).some((row) => row.id !== currentId);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { admin, cookieMutations } = auth;
  const { id } = await params;

  try {
    const existing = await loadPageOr404(admin, id);
    if (!existing) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'CMS page not found.' }, { status: 404 }),
        cookieMutations
      );
    }

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

    if (isReservedCmsSlug(payload.slug)) {
      return applySupabaseCookies(
        NextResponse.json(
          {
            error:
              'This slug is reserved for built-in application routes. Marketing sections are managed on the Home page.',
          },
          { status: 400 }
        ),
        cookieMutations
      );
    }

    const isUnique = await ensureUniqueSlug(admin, payload.slug, id);
    if (!isUnique) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'A page with this slug already exists.' }, { status: 409 }),
        cookieMutations
      );
    }

    const updatePayload = {
      ...payload,
      published_at:
        payload.status === 'published'
          ? existing.published_at || new Date().toISOString()
          : null,
      allow_delete:
        existing.is_protected_system_page && !existing.allow_delete
          ? false
          : payload.allow_delete,
    };

    const { data, error } = await admin
      .from('cms_pages')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return applySupabaseCookies(
      NextResponse.json({ page: serializePage(data as CmsPageRecord) }, { status: 200 }),
      cookieMutations
    );
  } catch (error: any) {
    return applySupabaseCookies(
      NextResponse.json({ error: error?.message || 'Failed to update CMS page.' }, { status: 500 }),
      cookieMutations
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { admin, cookieMutations } = auth;
  const { id } = await params;

  try {
    const existing = await loadPageOr404(admin, id);
    if (!existing) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'CMS page not found.' }, { status: 404 }),
        cookieMutations
      );
    }

    if (existing.is_protected_system_page && !existing.allow_delete) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Protected system pages cannot be deleted.' }, { status: 409 }),
        cookieMutations
      );
    }

    const { error } = await admin
      .from('cms_pages')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    return applySupabaseCookies(
      NextResponse.json({ success: true }, { status: 200 }),
      cookieMutations
    );
  } catch (error: any) {
    return applySupabaseCookies(
      NextResponse.json({ error: error?.message || 'Failed to delete CMS page.' }, { status: 500 }),
      cookieMutations
    );
  }
}
