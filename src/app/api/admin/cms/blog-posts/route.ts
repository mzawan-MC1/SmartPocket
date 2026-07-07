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

function serializePost(page: CmsPageRecord) {
  return {
    ...page,
    content_html: sanitizeRichTextHtml(page.content_html || ''),
    excerpt_resolved: deriveCmsExcerpt(page),
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
    .eq('content_type', 'blog')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false });

  if (error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to load blog posts.' }, { status: 500 }),
      cookieMutations
    );
  }

  return applySupabaseCookies(
    NextResponse.json({ posts: ((data as CmsPageRecord[] | null) || []).map(serializePost) }, { status: 200 }),
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

    const isUnique = await ensureUniqueSlug(admin, contentPayload.slug);
    if (!isUnique) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'A page or blog post with this slug already exists.' }, { status: 409 }),
        cookieMutations
      );
    }

    const insertPayload = {
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
          ? contentPayload.published_at || new Date().toISOString()
          : contentPayload.published_at || null,
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
      NextResponse.json({ post: serializePost(data as CmsPageRecord) }, { status: 201 }),
      cookieMutations
    );
  } catch (error: any) {
    return applySupabaseCookies(
      NextResponse.json({ error: error?.message || 'Failed to create blog post.' }, { status: 500 }),
      cookieMutations
    );
  }
}
