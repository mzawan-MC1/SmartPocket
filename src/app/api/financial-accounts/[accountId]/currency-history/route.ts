import { NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { logFinancialAccountsServerError } from '@/lib/financial-accounts-server';
import type { AccountCurrencyHistoryItem } from '@/lib/financial-account-currency-change';

export const runtime = 'nodejs';

async function requireRouteUser() {
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ accountId: string }> }
) {
  const auth = await requireRouteUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { accountId } = await context.params;
  const { supabase, cookieMutations, user } = auth;

  try {
    const { data: account, error: accountError } = await supabase
      .from('financial_accounts')
      .select('id, user_id, logical_account_id')
      .eq('id', accountId)
      .single();

    if (accountError || !account || account.user_id !== user.id) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Account not found' }, { status: 404 }),
        cookieMutations
      );
    }

    const logicalAccountId = account.logical_account_id || account.id;
    const [{ data: audits, error: auditsError }, { data: versions, error: versionsError }] = await Promise.all([
      supabase
        .from('account_currency_change_audits')
        .select(`
          id,
          action_type,
          previous_currency,
          new_currency,
          previous_balance,
          resulting_balance,
          exchange_rate,
          rate_provider,
          rate_timestamp,
          confirmed_at,
          created_at,
          account_id,
          old_account_id,
          new_account_id
        `)
        .eq('logical_account_id', logicalAccountId)
        .order('created_at', { ascending: false }),
      supabase
        .from('financial_accounts')
        .select('id, is_active')
        .eq('logical_account_id', logicalAccountId),
    ]);

    if (auditsError) {
      throw new Error(auditsError.message || 'Failed to load currency history');
    }
    if (versionsError) {
      throw new Error(versionsError.message || 'Failed to load account versions');
    }

    const activeById = new Map((versions || []).map((row) => [row.id, row.is_active === true]));
    const items: AccountCurrencyHistoryItem[] = (audits || []).map((row) => {
      const statusAccountId = row.new_account_id || row.account_id || row.old_account_id;
      return {
        id: row.id,
        actionType: row.action_type,
        previousCurrency: row.previous_currency,
        newCurrency: row.new_currency,
        previousBalance: Number(row.previous_balance || 0),
        resultingBalance: Number(row.resulting_balance || 0),
        exchangeRate: row.exchange_rate === null ? null : Number(row.exchange_rate),
        rateProvider: row.rate_provider || null,
        rateTimestamp: row.rate_timestamp || null,
        confirmedAt: row.confirmed_at || null,
        createdAt: row.created_at,
        currentStatus: activeById.get(statusAccountId) ? 'current' : 'archived',
      };
    });

    return applySupabaseCookies(
      NextResponse.json({ items }, { status: 200 }),
      cookieMutations
    );
  } catch (error) {
    logFinancialAccountsServerError('account-currency-history-route', error, {
      accountId,
      userId: user.id,
    });
    return applySupabaseCookies(
      NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load account currency history' }, { status: 500 }),
      cookieMutations
    );
  }
}
