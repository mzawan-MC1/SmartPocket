import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import {
  ensureDefaultPersonalAccounts,
  logFinancialAccountsServerError,
  sanitizeFinancialAccountPayload,
  sanitizeSpaceAccountSharingPayload,
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

const ACCOUNT_SELECT = `
  *,
  space:spaces(id, name, color),
  space_account_permissions(
    id,
    space_id,
    can_view_space_transactions,
    can_add_space_transactions,
    can_view_balance,
    can_view_full_history,
    space:spaces(id, name, color)
  )
`;

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { supabase, cookieMutations, user } = auth;

  await ensureDefaultPersonalAccounts(user.id);

  const activeOnly = request.nextUrl.searchParams.get('activeOnly') === 'true';

  let query = supabase
    .from('financial_accounts')
    .select(ACCOUNT_SELECT)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

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
    const sharingPayload = sanitizeSpaceAccountSharingPayload((body || {}).space_sharing);
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
        scope_type: payload.scope_type,
        space_id: payload.space_id,
        created_by_user_id: user.id,
        include_in_total: payload.scope_type === 'space' ? false : payload.include_in_total,
        current_balance: payload.opening_balance,
      })
      .select(ACCOUNT_SELECT)
      .single();

    if (error) {
      return applySupabaseCookies(
        NextResponse.json({ error: error.message || 'Failed to create account' }, { status: 500 }),
        cookieMutations
      );
    }

    if (payload.scope_type === 'personal' && sharingPayload.length > 0 && data?.id) {
      const { error: sharingError } = await supabase
        .from('space_account_permissions')
        .upsert(
          sharingPayload.map((entry) => ({
            account_id: data.id,
            granted_by_user_id: user.id,
            ...entry,
          })),
          { onConflict: 'space_id,account_id' }
        );

      if (sharingError) {
        return applySupabaseCookies(
          NextResponse.json({ error: sharingError.message || 'Failed to save sharing settings' }, { status: 500 }),
          cookieMutations
        );
      }

      const { data: refreshedAccount, error: refreshedError } = await supabase
        .from('financial_accounts')
        .select(ACCOUNT_SELECT)
        .eq('id', data.id)
        .single();

      if (refreshedError) {
        return applySupabaseCookies(
          NextResponse.json({ error: refreshedError.message || 'Failed to refresh account' }, { status: 500 }),
          cookieMutations
        );
      }

      return applySupabaseCookies(
        NextResponse.json({ account: refreshedAccount }, { status: 200 }),
        cookieMutations
      );
    }

    return applySupabaseCookies(
      NextResponse.json({ account: data }, { status: 200 }),
      cookieMutations
    );
  } catch (error) {
    logFinancialAccountsServerError('create-account-route', error, { userId: user.id });
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to create account' }, { status: 500 }),
      cookieMutations
    );
  }
}
