import { NextResponse } from 'next/server';
import { requireAdminRouteUser } from '@/lib/support-server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBlogTranslationStatus } from '@/lib/blog-translate-server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const admin = auth.admin ?? createAdminClient();

  if (!admin) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Supabase service role is not configured.' },
        { status: 500 }
      ),
      auth.cookieMutations
    );
  }

  const { data: existingPost, error: postErr } = await admin
    .from('cms_pages')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (postErr) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: postErr.message || 'Failed to lookup blog post.' },
        { status: 500 }
      ),
      auth.cookieMutations
    );
  }

  if (!existingPost) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Blog post not found.' },
        { status: 404 }
      ),
      auth.cookieMutations
    );
  }

  const result = await loadBlogTranslationStatus(admin, id, '');

  return applySupabaseCookies(
    NextResponse.json(
      {
        postId: id,
        sourceHash: result.enSourceHash,
        statuses: result.statuses,
      },
      { status: 200 }
    ),
    auth.cookieMutations
  );
}
