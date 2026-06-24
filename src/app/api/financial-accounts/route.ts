import { NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import {
  ensureDefaultPersonalAccounts,
  sanitizeFinancialAccountPayload,
  validateFinancialAccountInput,
} from '@/lib/financial-accounts-server';

export const runtime = 'nodejs';

async function requireUser() {
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

  return { ok: true as const, supabase, cookieMutations, user };
}

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { supabase, cookieMutations, user } = auth;

  await ensureDefaultPersonalAccounts(user.id);

  const { data, error } = await supabase
    .from('financial_accounts')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return applySupabaseCookies(
      NextResponse.json({ error: error.message || 'Failed to load accounts' }, { status: 500 }),
      cookieMutations
    );
  }

  return applySupabaseCookies(
    NextResponse.json({ accounts: data || [] }, { status: 200 }),
    cookieMutations
  );
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { supabase, cookieMutations, user } = auth;

  try {
    const body = await request.json();
    const payload = sanitizeFinancialAccountPayload(body || {});
    const validationError = validateFinancialAccountInput(payload);
    if (validationError) {
      return applySupabaseCookies(
        NextResponse.json({ error: validationError }, { status: 400 }),
        cookieMutations
      );
    }

    const { data, error } = await supabase
      .from('financial_accounts')
      .insert({
        user_id: user.id,
        ...payload,
        current_balance: payload.opening_balance,
      })
      .select('*')
      .single();

    if (error) {
      return applySupabaseCookies(
        NextResponse.json({ error: error.message || 'Failed to create account' }, { status: 500 }),
        cookieMutations
      );
    }

    return applySupabaseCookies(
      NextResponse.json({ account: data }, { status: 200 }),
      cookieMutations
    );
  } catch {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to create account' }, { status: 500 }),
      cookieMutations
    );
  }
}
