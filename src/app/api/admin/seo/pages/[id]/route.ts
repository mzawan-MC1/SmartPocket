import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import {
  isMarketingHomeSlug,
  normalizeCmsPageSeoPayload,
  type CmsPageRecord,
  type CmsPageSeoInput,
} from '@/lib/cms-pages';

function serializeSeoPage(page: CmsPageRecord) {
  return {
    ...page,
    pathname: `/${page.slug}`,
    page_kind:
      page.slug === 'contact' || page.slug === 'privacy' || page.slug === 'terms'
        ? 'fixed'
        : 'cms',
  };
}

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

    if (isMarketingHomeSlug(existing.slug)) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'Landing-page sections are managed through Home SEO, not as standalone page SEO records.' },
          { status: 400 }
        ),
        cookieMutations
      );
    }

    const body = (await request.json()) as Partial<CmsPageSeoInput>;
    const payload = normalizeCmsPageSeoPayload(body);

    const { data, error } = await admin
      .from('cms_pages')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return applySupabaseCookies(
      NextResponse.json({ page: serializeSeoPage(data as CmsPageRecord) }, { status: 200 }),
      cookieMutations
    );
  } catch (error: any) {
    return applySupabaseCookies(
      NextResponse.json({ error: error?.message || 'Failed to update page SEO.' }, { status: 500 }),
      cookieMutations
    );
  }
}
