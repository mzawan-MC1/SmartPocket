import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

type OverviewResponse = {
  configured: boolean;
  version: string | null;
  totals: {
    total_users: number | null;
    new_users_month: number | null;
    transactions: number | null;
    managed_people: number | null;
    spaces: number | null;
    reimbursements: number | null;
  };
  subscriptions: {
    trialing: number | null;
    active: number | null;
    expired: number | null;
    total_credits_consumed: number | null;
    estimated_cost_usd: number | null;
  };
  ai: {
    requests_month: number | null;
    failed_requests_month: number | null;
  };
  recent_users: Array<{ id: string; email: string | null; full_name: string | null; created_at: string | null }>;
  provider_health: Array<{
    provider: string;
    status: string;
    last_checked_at: string | null;
    last_error_category: string | null;
    response_time_ms: number | null;
  }>;
};

export async function GET() {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (process.env.NODE_ENV !== 'production') {
    console.info('[admin/overview] user', user?.id ?? 'none');
  }

  if (error || !user) {
    return applySupabaseCookies(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), cookieMutations);
  }

  if (user.app_metadata?.role !== 'admin') {
    return applySupabaseCookies(NextResponse.json({ error: 'Forbidden' }, { status: 403 }), cookieMutations);
  }

  let version: string | null = null;
  try {
    version = process.env.NEXT_PUBLIC_APP_VERSION || null;
  } catch {
    version = null;
  }

  const admin = createAdminClient();
  if (!admin) {
    const body: OverviewResponse = {
      configured: false,
      version,
      totals: {
        total_users: null,
        new_users_month: null,
        transactions: null,
        managed_people: null,
        spaces: null,
        reimbursements: null,
      },
      subscriptions: {
        trialing: null,
        active: null,
        expired: null,
        total_credits_consumed: null,
        estimated_cost_usd: null,
      },
      ai: {
        requests_month: null,
        failed_requests_month: null,
      },
      recent_users: [],
      provider_health: [],
    };

    return applySupabaseCookies(NextResponse.json(body, { status: 200 }), cookieMutations);
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));

  const [
    totalUsersRes,
    newUsersRes,
    transactionsRes,
    managedPeopleRes,
    spacesRes,
    reimbursementsRes,
    subsStatsRes,
    aiStatsRes,
    recentUsersRes,
    providerHealthRes,
    aiMonthRes,
  ] = await Promise.all([
    admin.from('user_profiles').select('*', { count: 'exact', head: true }),
    admin.from('user_profiles').select('*', { count: 'exact', head: true }).gte('created_at', monthStart.toISOString()),
    admin.from('transactions').select('*', { count: 'exact', head: true }),
    admin.from('managed_people').select('*', { count: 'exact', head: true }),
    admin.from('spaces').select('*', { count: 'exact', head: true }),
    admin.from('reimbursements').select('*', { count: 'exact', head: true }).eq('is_deleted', false),
    admin.rpc('get_subscription_admin_stats'),
    admin.rpc('get_ai_admin_stats', { p_period: 'month' }),
    admin.from('user_profiles').select('id,email,full_name,created_at').order('created_at', { ascending: false }).limit(5),
    admin.from('ai_provider_health').select('provider,status,last_checked_at,last_error_category,response_time_ms').order('last_checked_at', { ascending: false }).limit(5),
    admin
      .from('ai_requests')
      .select('status,created_at', { count: 'exact', head: true })
      .gte('created_at', monthStart.toISOString()),
  ]);

  const aiRequestsMonth = aiMonthRes.count ?? null;
  const aiFailedMonthRes = await admin
    .from('ai_requests')
    .select('status,created_at', { count: 'exact', head: true })
    .gte('created_at', monthStart.toISOString())
    .eq('status', 'failed');

  if (process.env.NODE_ENV !== 'production') {
    const err =
      totalUsersRes.error?.message ||
      newUsersRes.error?.message ||
      transactionsRes.error?.message ||
      subsStatsRes.error?.message ||
      aiStatsRes.error?.message ||
      recentUsersRes.error?.message ||
      providerHealthRes.error?.message ||
      aiMonthRes.error?.message ||
      aiFailedMonthRes.error?.message;
    if (err) console.error('[admin/overview] error:', err);
  }

  const subs = (subsStatsRes.data as any) || null;

  const body: OverviewResponse = {
    configured: true,
    version,
    totals: {
      total_users: totalUsersRes.count ?? null,
      new_users_month: newUsersRes.count ?? null,
      transactions: transactionsRes.count ?? null,
      managed_people: managedPeopleRes.count ?? null,
      spaces: spacesRes.count ?? null,
      reimbursements: reimbursementsRes.count ?? null,
    },
    subscriptions: {
      trialing: subs?.trialing ?? null,
      active: subs?.active ?? null,
      expired: subs?.expired ?? null,
      total_credits_consumed: subs?.total_credits_consumed ?? null,
      estimated_cost_usd: subs?.estimated_cost_usd ?? null,
    },
    ai: {
      requests_month: aiRequestsMonth,
      failed_requests_month: aiFailedMonthRes.count ?? null,
    },
    recent_users: (recentUsersRes.data as any[])?.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      full_name: u.full_name ?? null,
      created_at: u.created_at ?? null,
    })) ?? [],
    provider_health: (providerHealthRes.data as any[]) ?? [],
  };

  return applySupabaseCookies(NextResponse.json(body, { status: 200 }), cookieMutations);
}

