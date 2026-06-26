import { NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import { isValidUuid } from '@/lib/faqs';
import { reorderFaqItems } from '@/lib/faqs-admin-server';
import { requireAdminRouteUser } from '@/lib/support-server';

export async function POST(request: Request) {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = (await request.json()) as { ids?: string[] };
    const ids = Array.isArray(body.ids) ? body.ids : [];

    if (ids.length === 0 || ids.some((id) => !isValidUuid(id))) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Provide a valid FAQ order.' }, { status: 400 }),
        auth.cookieMutations
      );
    }

    await reorderFaqItems({
      admin: auth.admin,
      ids,
    });

    return applySupabaseCookies(
      NextResponse.json({ success: true }, { status: 200 }),
      auth.cookieMutations
    );
  } catch {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to reorder FAQs.' }, { status: 500 }),
      auth.cookieMutations
    );
  }
}
