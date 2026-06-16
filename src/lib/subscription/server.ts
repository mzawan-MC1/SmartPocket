import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SubscriptionSummary {
  has_subscription: boolean;
  plan_name?: string;
  plan_code?: string;
  status?: string;
  trial_ends_at?: string;
  current_period_end?: string;
  monthly_ai_credits?: number;
  daily_ai_request_limit?: number;
  monthly_voice_seconds?: number;
  text_ai_enabled?: boolean;
  voice_ai_enabled?: boolean;
  ai_history_enabled?: boolean;
  credits_allocated?: number;
  credits_consumed?: number;
  credits_reserved?: number;
  credits_refunded?: number;
  voice_seconds_used?: number;
  requests_today?: number;
  cycle_start?: string;
  cycle_end?: string;
}

type EnsureSummaryResult = {
  summary: SubscriptionSummary;
  initResult: 'existing' | 'initialized' | 'empty';
  errorMessage: string | null;
};

const EMPTY_SUBSCRIPTION_SUMMARY: SubscriptionSummary = {
  has_subscription: false,
  credits_allocated: 0,
  credits_consumed: 0,
  credits_reserved: 0,
  credits_refunded: 0,
  voice_seconds_used: 0,
  requests_today: 0,
};

function createSubscriptionAdminClient(): SupabaseClient | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return null;
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function fetchSubscriptionSummary(userId: string, supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc('get_user_subscription_summary', { p_user_id: userId });

  return {
    data: (data as SubscriptionSummary | null) ?? null,
    errorMessage: error?.message ?? null,
  };
}

async function initializeFreeTrial(userId: string) {
  const admin = createSubscriptionAdminClient();
  if (!admin) {
    return {
      initialized: false,
      errorMessage: 'config:missing_service_role',
    };
  }

  const { data: existingSubscription, error: existingError } = await admin
    .from('user_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingError) {
    return {
      initialized: false,
      errorMessage: existingError.message,
    };
  }

  if (existingSubscription) {
    return {
      initialized: false,
      errorMessage: null,
    };
  }

  const { error } = await admin.rpc('assign_free_trial', {
    p_user_id: userId,
  });

  return {
    initialized: !error,
    errorMessage: error?.message ?? null,
  };
}

export async function ensureUserSubscriptionSummary(userId: string): Promise<EnsureSummaryResult> {
  const admin = createSubscriptionAdminClient();
  if (!admin) {
    return {
      summary: { ...EMPTY_SUBSCRIPTION_SUMMARY, status: 'unavailable' },
      initResult: 'empty',
      errorMessage: 'config:missing_service_role',
    };
  }

  const initialSummary = await fetchSubscriptionSummary(userId, admin);
  if (initialSummary.errorMessage) {
    return {
      summary: EMPTY_SUBSCRIPTION_SUMMARY,
      initResult: 'empty',
      errorMessage: `rpc:${initialSummary.errorMessage}`,
    };
  }

  if (initialSummary.data) {
    return {
      summary: initialSummary.data,
      initResult: 'existing',
      errorMessage: null,
    };
  }

  const initTrial = await initializeFreeTrial(userId);
  if (initTrial.errorMessage) {
    return {
      summary: initTrial.errorMessage.startsWith('config:')
        ? { ...EMPTY_SUBSCRIPTION_SUMMARY, status: 'unavailable' }
        : EMPTY_SUBSCRIPTION_SUMMARY,
      initResult: 'empty',
      errorMessage: initTrial.errorMessage,
    };
  }

  const nextSummary = await fetchSubscriptionSummary(userId, admin);
  if (nextSummary.errorMessage) {
    return {
      summary: EMPTY_SUBSCRIPTION_SUMMARY,
      initResult: 'empty',
      errorMessage: `rpc:${nextSummary.errorMessage}`,
    };
  }

  return {
    summary: nextSummary.data ?? EMPTY_SUBSCRIPTION_SUMMARY,
    initResult: initTrial.initialized ? 'initialized' : 'empty',
    errorMessage: null,
  };
}

export async function ensureUserSubscriptionSummaryWithUserClient(
  userId: string,
  userSupabase: SupabaseClient
): Promise<EnsureSummaryResult> {
  const initialSummary = await fetchSubscriptionSummary(userId, userSupabase);
  if (initialSummary.errorMessage) {
    return {
      summary: EMPTY_SUBSCRIPTION_SUMMARY,
      initResult: 'empty',
      errorMessage: `rpc:${initialSummary.errorMessage}`,
    };
  }

  if (initialSummary.data) {
    return {
      summary: initialSummary.data,
      initResult: 'existing',
      errorMessage: null,
    };
  }

  const initTrial = await initializeFreeTrial(userId);
  if (initTrial.errorMessage) {
    return {
      summary: initTrial.errorMessage.startsWith('config:')
        ? { ...EMPTY_SUBSCRIPTION_SUMMARY, status: 'unavailable' }
        : EMPTY_SUBSCRIPTION_SUMMARY,
      initResult: 'empty',
      errorMessage: initTrial.errorMessage,
    };
  }

  const nextSummary = await fetchSubscriptionSummary(userId, userSupabase);
  if (nextSummary.errorMessage) {
    return {
      summary: EMPTY_SUBSCRIPTION_SUMMARY,
      initResult: 'empty',
      errorMessage: `rpc:${nextSummary.errorMessage}`,
    };
  }

  return {
    summary: nextSummary.data ?? EMPTY_SUBSCRIPTION_SUMMARY,
    initResult: initTrial.initialized ? 'initialized' : 'empty',
    errorMessage: null,
  };
}
