import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import {
  isFixedPublicPageSlug,
  isMarketingHomeSlug,
  type CmsPageRecord,
} from '@/lib/cms-pages';

function getSeoPageSortRank(slug: string) {
  switch (slug) {
    case 'contact':
      return 1;
    case 'privacy':
      return 2;
    case 'terms':
      return 3;
    default:
      return 10;
  }
}

function serializeSeoPage(page: CmsPageRecord) {
  return {
    ...page,
    pathname: `/${page.slug}`,
    page_kind: isFixedPublicPageSlug(page.slug) ? 'fixed' : 'cms',
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
    .order('title', { ascending: true });

  if (error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to load page SEO records.' }, { status: 500 }),
      cookieMutations
    );
  }

  const pages = ((data as CmsPageRecord[] | null) || [])
    .filter((page) => {
      if (isMarketingHomeSlug(page.slug)) {
        return false;
      }

      if (isFixedPublicPageSlug(page.slug)) {
        return true;
      }

      return page.status === 'published' && page.is_enabled;
    })
    .sort((a, b) => {
      const rankDiff = getSeoPageSortRank(a.slug) - getSeoPageSortRank(b.slug);
      if (rankDiff !== 0) {
        return rankDiff;
      }

      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }

      return a.title.localeCompare(b.title);
    })
    .map(serializeSeoPage);

  return applySupabaseCookies(
    NextResponse.json({ pages }, { status: 200 }),
    cookieMutations
  );
}
