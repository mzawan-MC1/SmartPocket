import { NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { ensureDefaultPersonalAccounts } from '@/lib/financial-accounts-server';

export const runtime = 'nodejs';

export async function POST() {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      cookieMutations
    );
  }

  const result = await ensureDefaultPersonalAccounts(user.id);

  return applySupabaseCookies(
    NextResponse.json({ success: true, result }, { status: 200 }),
    cookieMutations
  );
}
