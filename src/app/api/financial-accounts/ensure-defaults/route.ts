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
  if (!result) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to ensure default personal accounts' }, { status: 500 }),
      cookieMutations
    );
  }

  const targetCurrency = result.target_currency || null;
  const cashNeedsSync = Boolean(
    targetCurrency
    && result.cash_currency
    && result.cash_currency !== targetCurrency
  );
  const bankNeedsSync = Boolean(
    targetCurrency
    && result.bank_currency
    && result.bank_currency !== targetCurrency
  );
  const hasUnsafeSyncSkip = result.cash_currency_sync_status === 'skipped_non_pristine'
    || result.bank_currency_sync_status === 'skipped_non_pristine'
    || cashNeedsSync
    || bankNeedsSync;

  if (hasUnsafeSyncSkip) {
    return applySupabaseCookies(
      NextResponse.json({
        error: 'Default personal account currency could not be synchronized safely',
        result,
      }, { status: 409 }),
      cookieMutations
    );
  }

  return applySupabaseCookies(
    NextResponse.json({ success: true, result }, { status: 200 }),
    cookieMutations
  );
}
