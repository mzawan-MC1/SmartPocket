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
import {
  blogSourceInputChanged,
  loadBlogTranslationStatus,
  saveBlogTranslationsForPage,
  upsertBlogLocalizedImages,
} from '@/lib/blog-translate-server';
import type { SupportedLanguage } from '@/i18n/registry';

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
  if (error) throw error;
  return (data as CmsPageRecord | null) || null;
}

async function ensureUniqueSlug(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  slug: string,
  currentId: string
) {
  const { data, error } = await admin.from('cms_pages').select('id').ilike('slug', slug);
  if (error) throw error;
  return !(data || []).some((row) => row.id !== currentId);
}

export async function PATCH(
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

    const rawBody = (await request.json()) as Partial<
      CmsBlogAdminInput & {
        regenerate_translations?: boolean;
        localized_images?: Partial<
          Record<
            SupportedLanguage,
            { cover_image_url?: string | null; seo_image_url?: string | null; twitter_image_url?: string | null }
          >
        >;
      }
    >;
    const { regenerate_translations, localized_images, ...body } = rawBody;

    const contentPayload = normalizeCmsPagePayload({
      ...(existing as any),
      ...body,
      content_type: 'blog',
      show_in_header: false,
      show_in_footer: false,
      navigation_label: '',
      sort_order: 0,
      allow_delete: true,
    });
    const seoPayload = normalizeCmsPageSeoPayload({
      seo_title: existing.seo_title || '',
      seo_description: existing.seo_description || '',
      seo_keywords: existing.seo_keywords || '',
      seo_image_url: existing.seo_image_url || '',
      og_title: existing.og_title || '',
      og_description: existing.og_description || '',
      twitter_title: existing.twitter_title || '',
      twitter_description: existing.twitter_description || '',
      twitter_image_url: existing.twitter_image_url || '',
      canonical_url_override: existing.canonical_url_override || '',
      robots_index: existing.robots_index,
      robots_follow: existing.robots_follow,
      ...body,
    });

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
        NextResponse.json(
          { error: 'This slug is reserved for built-in application routes.' },
          { status: 400 }
        ),
        cookieMutations
      );
    }

    const isUnique = await ensureUniqueSlug(admin, contentPayload.slug, id);
    if (!isUnique) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'A page or blog post with this slug already exists.' },
          { status: 409 }
        ),
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

    if (error) throw error;

    const saved = data as CmsPageRecord;
    if (localized_images) {
      await upsertBlogLocalizedImages(admin, saved.id, localized_images);
    }

    const mergedInput = { ...(existing as any), ...body };
    const fieldsChanged = blogSourceInputChanged(existing as any, mergedInput as CmsBlogAdminInput);
    const shouldTranslate = regenerate_translations === true || fieldsChanged;

    let translateResult: Awaited<ReturnType<typeof saveBlogTranslationsForPage>> | null = null;
    if (shouldTranslate) {
      translateResult = await saveBlogTranslationsForPage(
        admin,
        saved.id,
        {
          title: saved.title,
          excerpt: saved.excerpt || '',
          content_html: saved.content_html || '',
          category: saved.category || '',
          tags: Array.isArray(saved.tags) ? saved.tags : [],
          cover_image_alt: saved.cover_image_alt || '',
          seo_title: saved.seo_title || '',
          seo_description: saved.seo_description || '',
          seo_keywords: saved.seo_keywords || '',
          og_title: saved.og_title || '',
          og_description: saved.og_description || '',
          twitter_title: saved.twitter_title || '',
          twitter_description: saved.twitter_description || '',
        },
        { regenerateAll: regenerate_translations === true }
      );
    }

    const enSourceHash = translateResult?.sourceHash || String(saved.en_source_version_hash || '');
    const statuses = (await loadBlogTranslationStatus(admin, saved.id, enSourceHash)).statuses;
    const scheduledLanguages = translateResult?.scheduledLanguages || [];
    const totalEnabled = translateResult?.totalEnabled ?? 0;

    return applySupabaseCookies(
      NextResponse.json(
        {
          post: serializePost(saved),
          translation: {
            statuses,
            enSourceHash,
            scheduledLanguages,
            totalEnabled,
            pendingWork: scheduledLanguages.length > 0,
          },
        },
        { status: 200 }
      ),
      cookieMutations
    );
  } catch (error: any) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: error?.message || 'Failed to update blog post.' },
        { status: 500 }
      ),
      cookieMutations
    );
  }
}

export async function DELETE(
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
    const { error } = await admin
      .from('cms_pages')
      .delete()
      .eq('id', id)
      .eq('content_type', 'blog');
    if (error) throw error;
    return applySupabaseCookies(NextResponse.json({ success: true }, { status: 200 }), cookieMutations);
  } catch (error: any) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: error?.message || 'Failed to delete blog post.' },
        { status: 500 }
      ),
      cookieMutations
    );
  }
}
