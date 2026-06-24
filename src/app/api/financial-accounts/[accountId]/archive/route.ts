import { NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  context: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await context.params;
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      cookieMutations
    );
  }

  const { error } = await supabase.rpc('rpc_archive_financial_account', {
    p_account_id: accountId,
  });

  if (error) {
    return applySupabaseCookies(
      NextResponse.json({ error: error.message || 'Failed to archive account' }, { status: 400 }),
      cookieMutations
    );
  }

  return applySupabaseCookies(
    NextResponse.json({ success: true }, { status: 200 }),
    cookieMutations
  );
}
