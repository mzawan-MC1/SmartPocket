import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import {
  deriveCmsExcerpt,
  isReservedCmsSlug,
  normalizeCmsPagePayload,
  normalizeCmsPageSeoPayload,
  sanitizeRichTextHtml,
  type CmsBlogAdminInput,
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

function serializePost(page: CmsPageRecord) {
  return {
    ...page,
    content_html: sanitizeRichTextHtml(page.content_html || ''),
    excerpt_resolved: deriveCmsExcerpt(page),
    can_delete: !(page.is_protected_system_page && !page.allow_delete),
  };
}

async function loadBlogPostOr404(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  id: string
) {
  const { data, error } = await admin
    .from('cms_pages')
    .select('*')
    .eq('id', id)
    .eq('content_type', 'blog')
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
    const existing = await loadBlogPostOr404(admin, id);
    if (!existing) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Blog post not found.' }, { status: 404 }),
        cookieMutations
      );
    }

    const body = (await request.json()) as Partial<CmsBlogAdminInput>;
    const contentPayload = normalizeCmsPagePayload({
      ...body,
      content_type: 'blog',
      show_in_header: false,
      show_in_footer: false,
      navigation_label: '',
      sort_order: 0,
      allow_delete: true,
    });
    const seoPayload = normalizeCmsPageSeoPayload(body);

    if (!contentPayload.title) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Blog post title is required.' }, { status: 400 }),
        cookieMutations
      );
    }

    if (!contentPayload.slug) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Blog post slug is required.' }, { status: 400 }),
        cookieMutations
      );
    }

    if (isReservedCmsSlug(contentPayload.slug)) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'This slug is reserved for built-in application routes.' }, { status: 400 }),
        cookieMutations
      );
    }

    const isUnique = await ensureUniqueSlug(admin, contentPayload.slug, id);
    if (!isUnique) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'A page or blog post with this slug already exists.' }, { status: 409 }),
        cookieMutations
      );
    }

    const updatePayload = {
      ...contentPayload,
      ...seoPayload,
      content_type: 'blog',
      show_in_header: false,
      show_in_footer: false,
      navigation_label: '',
      sort_order: 0,
      is_protected_system_page: false,
      allow_delete: true,
      published_at:
        contentPayload.status === 'published'
          ? contentPayload.published_at || existing.published_at || new Date().toISOString()
          : contentPayload.published_at || existing.published_at || null,
    };

    const { data, error } = await admin
      .from('cms_pages')
      .update(updatePayload)
      .eq('id', id)
      .eq('content_type', 'blog')
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return applySupabaseCookies(
      NextResponse.json({ post: serializePost(data as CmsPageRecord) }, { status: 200 }),
      cookieMutations
    );
  } catch (error: any) {
    return applySupabaseCookies(
      NextResponse.json({ error: error?.message || 'Failed to update blog post.' }, { status: 500 }),
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
    const existing = await loadBlogPostOr404(admin, id);
    if (!existing) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Blog post not found.' }, { status: 404 }),
        cookieMutations
      );
    }

    const { error } = await admin
      .from('cms_pages')
      .delete()
      .eq('id', id)
      .eq('content_type', 'blog');

    if (error) {
      throw error;
    }

    return applySupabaseCookies(
      NextResponse.json({ success: true }, { status: 200 }),
      cookieMutations
    );
  } catch (error: any) {
    return applySupabaseCookies(
      NextResponse.json({ error: error?.message || 'Failed to delete blog post.' }, { status: 500 }),
      cookieMutations
    );
  }
}
