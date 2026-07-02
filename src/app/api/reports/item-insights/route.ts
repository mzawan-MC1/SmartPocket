import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import {
  getItemIdentityOptions,
  getItemInsightsSnapshot,
  getReceiptDashboardInsights,
} from '@/lib/transaction-item-insights';
import { requireStandardReportsAccess } from '@/lib/subscription/server';

function parseBoolean(value: string | null) {
  return value === 'true';
}

function parseFilters(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const valueOrUndefined = (value: string | null) => {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized || undefined;
  };

  return {
    mode: valueOrUndefined(searchParams.get('mode')) || 'page',
    startDate: valueOrUndefined(searchParams.get('startDate')),
    endDate: valueOrUndefined(searchParams.get('endDate')),
    scopeType: valueOrUndefined(searchParams.get('scopeType')) as 'personal' | 'space' | undefined,
    spaceId: valueOrUndefined(searchParams.get('spaceId')) || null,
    transactionType: valueOrUndefined(searchParams.get('transactionType')) as 'expense' | 'income' | undefined,
    merchant: valueOrUndefined(searchParams.get('merchant')),
    itemName: valueOrUndefined(searchParams.get('item')),
    categoryId: valueOrUndefined(searchParams.get('categoryId')),
    accountId: valueOrUndefined(searchParams.get('accountId')),
    currency: valueOrUndefined(searchParams.get('currency')),
    includeNonRegular: parseBoolean(searchParams.get('includeNonRegular')),
  };
}

export async function GET(request: NextRequest) {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return applySupabaseCookies(
      NextResponse.json({
        success: false,
        errorMessage: 'Unauthorized',
      }, { status: 401 }),
      cookieMutations
    );
  }

  const access = await requireStandardReportsAccess(user.id, { skipUsageCheck: true });
  if (!access.ok) {
    return applySupabaseCookies(
      NextResponse.json({
        success: false,
        error: access.error,
        errorMessage: access.error.message,
      }, { status: access.error.code === 'usage_exhausted' ? 429 : 403 }),
      cookieMutations
    );
  }

  const filters = parseFilters(request);

  try {
    if (filters.mode === 'dashboard') {
      const insights = await getReceiptDashboardInsights({
        ...filters,
        supabaseClient: supabase,
      });
      return applySupabaseCookies(
        NextResponse.json({
          success: true,
          insights,
        }),
        cookieMutations
      );
    }

    const [snapshot, identityOptions] = await Promise.all([
      getItemInsightsSnapshot({
        ...filters,
        supabaseClient: supabase,
      }),
      getItemIdentityOptions(supabase),
    ]);

    return applySupabaseCookies(
      NextResponse.json({
        success: true,
        snapshot,
        identityOptions,
      }),
      cookieMutations
    );
  } catch (error) {
    return applySupabaseCookies(
      NextResponse.json({
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Failed to load item insights.',
      }, { status: 500 }),
      cookieMutations
    );
  }
}
