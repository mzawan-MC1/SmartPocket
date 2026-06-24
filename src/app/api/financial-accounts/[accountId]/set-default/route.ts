import { NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
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

  let defaultType = '';

  try {
    const body = await request.json();
    defaultType = typeof body?.defaultType === 'string' ? body.defaultType.trim() : '';
  } catch {
  }

  if (defaultType !== 'personal_cash' && defaultType !== 'personal_bank') {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unsupported default type' }, { status: 400 }),
      cookieMutations
    );
  }

  const { data, error } = await supabase.rpc('rpc_set_default_financial_account', {
    p_account_id: accountId,
    p_default_type: defaultType,
  });

  if (error) {
    return applySupabaseCookies(
      NextResponse.json({ error: error.message || 'Failed to set default account' }, { status: 400 }),
      cookieMutations
    );
  }

  return applySupabaseCookies(
    NextResponse.json({ success: true, result: Array.isArray(data) ? data[0] : data }, { status: 200 }),
    cookieMutations
  );
}
