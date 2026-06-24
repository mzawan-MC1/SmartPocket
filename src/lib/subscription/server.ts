import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendTransactionalEmail } from '@/lib/email/transactional';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { getBillingAvailability, getBillingProvider } from '@/lib/billing/provider';
import {
  buildPlanPricingDetails,
} from '@/lib/subscription/pricing';
import type {
  BillingProvider,
  VerifiedBillingEvent,
} from '@/lib/billing/types';
import type {
  BillingActionError,
  BillingCheckoutResponse,
  BillingMutationResponse,
  BillingPortalResponse,
  PublicSubscriptionPlan,
  SubscriptionSummary,
  SubscriptionSummaryResponse,
  SubscriptionPlansResponse,
  SupportedBillingInterval,
} from '@/lib/subscription/types';

type EnsureSummaryResult = {
  summary: SubscriptionSummary;
  initResult: 'existing' | 'initialized' | 'empty';
  errorMessage: string | null;
};

type RawPlanRow = {
  id: string;
  plan_code: PublicSubscriptionPlan['planCode'];
  plan_name: string;
  description: string | null;
  price_amount: number | string | null;
  billing_interval: SupportedBillingInterval;
  yearly_discount_percent: number | string | null;
  trial_duration_days: number | null;
  monthly_ai_credits: number | null;
  daily_ai_request_limit: number | null;
  monthly_voice_seconds: number | null;
  monthly_receipt_extractions: number | null;
  receipt_intelligence_enabled: boolean | null;
  text_ai_enabled: boolean | null;
  voice_ai_enabled: boolean | null;
  ai_history_enabled: boolean | null;
  ai_history_retention_days: number | null;
  managed_people_enabled: boolean | null;
  shared_spaces_enabled: boolean | null;
  standard_reports_enabled: boolean | null;
  family_reports_enabled: boolean | null;
  is_active: boolean | null;
  display_order: number | null;
};

type RawFeatureLimitRow = {
  plan_id: string;
  feature_key: string;
  feature_val: string;
};

type RawUserSubscriptionRow = {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  notes: string | null;
  subscription_plans: RawPlanRow | RawPlanRow[] | null;
};

type RawBillingSubscriptionRow = {
  id: string;
  user_id: string;
  plan_id: string;
  provider: string;
  provider_subscription_id: string;
  provider_price_id: string | null;
  status: string;
  billing_interval: SupportedBillingInterval;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  cancelled_at: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string;
};

type RawUsageCycleRow = {
  id: string;
  cycle_start: string;
  cycle_end: string;
  credits_allocated: number | null;
  credits_consumed: number | null;
  credits_reserved: number | null;
  credits_refunded: number | null;
  voice_seconds_used: number | null;
  requests_today: number | null;
  last_request_date: string | null;
  receipt_extractions_allocated: number | null;
  receipt_extractions_consumed: number | null;
  receipt_extractions_reserved: number | null;
  receipt_extractions_refunded: number | null;
};

type AuthenticatedCheckoutInput = {
  userId: string;
  email: string | null;
  planCode: PublicSubscriptionPlan['planCode'];
  billingInterval: SupportedBillingInterval;
  successUrl: string;
  cancelUrl: string;
};

const EMPTY_SUBSCRIPTION_SUMMARY: SubscriptionSummary = {
  hasSubscription: false,
  status: 'inactive',
  creditsAllocated: 0,
  creditsConsumed: 0,
  creditsReserved: 0,
  creditsRefunded: 0,
  voiceSecondsUsed: 0,
  requestsToday: 0,
  monthlyReceiptExtractions: 0,
  receiptIntelligenceEnabled: false,
  receiptExtractionsIncluded: 0,
  receiptExtractionsUsed: 0,
  receiptExtractionsReserved: 0,
  receiptExtractionsRefunded: 0,
  receiptExtractionsRemaining: 0,
};

function createSubscriptionAdminClient(): SupabaseClient | null {
  return createAdminClient();
}

function createAnonServerClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return null;
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function toPlanRow(value: RawPlanRow | RawPlanRow[] | null | undefined): RawPlanRow | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizePlan(
  row: RawPlanRow,
  featureLimits: RawFeatureLimitRow[],
  monthlyBasePlansByCode: Map<PublicSubscriptionPlan['planCode'], RawPlanRow>
): PublicSubscriptionPlan {
  const monthlyBasePlan = row.billing_interval === 'yearly'
    ? monthlyBasePlansByCode.get(row.plan_code) ?? row
    : row;
  const pricing = buildPlanPricingDetails({
    billingInterval: row.billing_interval,
    priceAmount: row.price_amount,
    monthlyBasePriceAmount: monthlyBasePlan?.price_amount ?? row.price_amount,
    yearlyDiscountPercent: row.yearly_discount_percent ?? monthlyBasePlan?.yearly_discount_percent ?? 0,
  });

  return {
    id: row.id,
    planCode: row.plan_code,
    planName: row.plan_name,
    description: row.description ?? null,
    priceAmount: pricing.billedPriceAmount,
    billingInterval: row.billing_interval,
    monthlyBasePriceAmount: pricing.monthlyBasePriceAmount,
    yearlyDiscountPercent: pricing.yearlyDiscountPercent,
    yearlySavingAmount: pricing.yearlySavingAmount,
    equivalentMonthlyPriceAmount: pricing.equivalentMonthlyPriceAmount,
    trialDurationDays: row.trial_duration_days ?? 0,
    monthlyAiCredits: row.monthly_ai_credits ?? 0,
    dailyAiRequestLimit: row.daily_ai_request_limit ?? 0,
    monthlyVoiceSeconds: row.monthly_voice_seconds ?? 0,
    monthlyReceiptExtractions: row.monthly_receipt_extractions ?? 0,
    receiptIntelligenceEnabled: Boolean(row.receipt_intelligence_enabled),
    textAiEnabled: Boolean(row.text_ai_enabled),
    voiceAiEnabled: Boolean(row.voice_ai_enabled),
    aiHistoryEnabled: Boolean(row.ai_history_enabled),
    aiHistoryRetentionDays: row.ai_history_retention_days ?? 0,
    managedPeopleEnabled: Boolean(row.managed_people_enabled),
    sharedSpacesEnabled: Boolean(row.shared_spaces_enabled),
    standardReportsEnabled: Boolean(row.standard_reports_enabled),
    familyReportsEnabled: Boolean(row.family_reports_enabled),
    isActive: Boolean(row.is_active),
    displayOrder: row.display_order ?? 0,
    featureLimits: featureLimits
      .filter((item) => item.plan_id === row.id)
      .map((item) => ({
        featureKey: item.feature_key,
        featureValue: item.feature_val,
      })),
  };
}

function pickPreferredBillingSubscription(rows: RawBillingSubscriptionRow[]) {
  return rows
    .slice()
    .sort((left, right) => {
      const leftRank = ['active', 'trialing', 'past_due', 'cancelled'].indexOf(left.status);
      const rightRank = ['active', 'trialing', 'past_due', 'cancelled'].indexOf(right.status);
      return (leftRank === -1 ? 99 : leftRank) - (rightRank === -1 ? 99 : rightRank)
        || new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    })[0] ?? null;
}

function normalizeSummaryStatus(rawStatus: string | null | undefined, trialEndsAt?: string | null): SubscriptionSummary['status'] {
  if (rawStatus === 'trialing') {
    if (trialEndsAt && new Date(trialEndsAt).getTime() < Date.now()) {
      return 'expired';
    }
    return 'trialing';
  }

  switch (rawStatus) {
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'cancelled':
      return 'cancelled';
    case 'paused':
      return 'paused';
    case 'expired':
    case 'unpaid':
    case 'incomplete_expired':
      return 'expired';
    case 'inactive':
      return 'inactive';
    default:
      return 'inactive';
  }
}

function calculateTrialDaysRemaining(trialEndsAt: string | null | undefined) {
  if (!trialEndsAt) return null;
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000));
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

async function loadCurrentUsageCycle(
  admin: SupabaseClient,
  userId: string,
  preferredCycleStart?: string | null
) {
  if (preferredCycleStart) {
    const { data: exactCycle, error: exactError } = await admin
      .from('ai_usage_cycles')
      .select('*')
      .eq('user_id', userId)
      .eq('cycle_start', preferredCycleStart)
      .maybeSingle();

    if (exactError) {
      throw exactError;
    }

    if (exactCycle) {
      return exactCycle as RawUsageCycleRow;
    }
  }

  const { data: createdCycleId, error: createCycleError } = await admin.rpc('get_or_create_usage_cycle', {
    p_user_id: userId,
  });

  if (createCycleError) {
    throw createCycleError;
  }

  if (createdCycleId) {
    const { data: createdCycle, error: createdCycleError } = await admin
      .from('ai_usage_cycles')
      .select('*')
      .eq('id', createdCycleId as string)
      .maybeSingle();

    if (createdCycleError) {
      throw createdCycleError;
    }

    if (createdCycle) {
      return createdCycle as RawUsageCycleRow;
    }
  }

  const { data: latestCycle, error: latestCycleError } = await admin
    .from('ai_usage_cycles')
    .select('*')
    .eq('user_id', userId)
    .order('cycle_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestCycleError) {
    throw latestCycleError;
  }

  return (latestCycle as RawUsageCycleRow | null) ?? null;
}

async function loadSummaryForUser(userId: string): Promise<SubscriptionSummary> {
  const admin = createSubscriptionAdminClient();
  if (!admin) {
    return { ...EMPTY_SUBSCRIPTION_SUMMARY, status: 'unavailable' };
  }

  const { data: subscriptionRow, error: subscriptionError } = await admin
    .from('user_subscriptions')
    .select(`
      id,
      user_id,
      plan_id,
      status,
      trial_started_at,
      trial_ends_at,
      current_period_start,
      current_period_end,
      cancelled_at,
      notes,
      subscription_plans (
        id,
        plan_code,
        plan_name,
        description,
        price_amount,
        billing_interval,
        yearly_discount_percent,
        trial_duration_days,
        monthly_ai_credits,
        daily_ai_request_limit,
        monthly_voice_seconds,
        monthly_receipt_extractions,
        receipt_intelligence_enabled,
        text_ai_enabled,
        voice_ai_enabled,
        ai_history_enabled,
        ai_history_retention_days,
        managed_people_enabled,
        shared_spaces_enabled,
        standard_reports_enabled,
        family_reports_enabled,
        is_active,
        display_order
      )
    `)
    .eq('user_id', userId)
    .maybeSingle();

  if (subscriptionError) {
    throw subscriptionError;
  }

  if (!subscriptionRow) {
    return EMPTY_SUBSCRIPTION_SUMMARY;
  }

  const subscription = subscriptionRow as unknown as RawUserSubscriptionRow;
  const planRow = toPlanRow(subscription.subscription_plans);

  if (!planRow) {
    return EMPTY_SUBSCRIPTION_SUMMARY;
  }

  let monthlyBasePlan: Pick<RawPlanRow, 'price_amount' | 'yearly_discount_percent'> | null = null;
  if (planRow.plan_code !== 'free_trial') {
    const { data: monthlyBasePlanRow, error: monthlyBasePlanError } = await admin
      .from('subscription_plans')
      .select('price_amount, yearly_discount_percent')
      .eq('plan_code', planRow.plan_code)
      .eq('billing_interval', 'monthly')
      .limit(1)
      .maybeSingle();

    if (monthlyBasePlanError) {
      throw monthlyBasePlanError;
    }

    monthlyBasePlan = (monthlyBasePlanRow as Pick<RawPlanRow, 'price_amount' | 'yearly_discount_percent'> | null) ?? null;
  }

  const { data: billingSubscriptionRows, error: billingSubscriptionError } = await admin
    .from('billing_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(10);

  if (billingSubscriptionError) {
    throw billingSubscriptionError;
  }

  const billingSubscription = pickPreferredBillingSubscription(
    (billingSubscriptionRows as RawBillingSubscriptionRow[] | null) ?? []
  );

  const preferredCycleStart = billingSubscription?.current_period_start
    || null;

  const usageCycle = await loadCurrentUsageCycle(admin, userId, preferredCycleStart);
  const trialDaysRemaining = calculateTrialDaysRemaining(subscription.trial_ends_at);
  const effectiveStatus = normalizeSummaryStatus(
    billingSubscription?.status || subscription.status,
    subscription.trial_ends_at
  );
  const cycleStart = usageCycle?.cycle_start ?? preferredCycleStart ?? null;
  const cycleEnd = usageCycle?.cycle_end ?? billingSubscription?.current_period_end ?? null;
  const receiptIntelligenceEnabled = Boolean(planRow.receipt_intelligence_enabled);
  const receiptUsed = usageCycle?.receipt_extractions_consumed ?? 0;
  const receiptReserved = usageCycle?.receipt_extractions_reserved ?? 0;
  const receiptIncluded = receiptIntelligenceEnabled
    ? Math.max(
        usageCycle?.receipt_extractions_allocated ?? 0,
        planRow.monthly_receipt_extractions ?? 0,
        receiptUsed + receiptReserved
      )
    : 0;
  const pricing = buildPlanPricingDetails({
    billingInterval: billingSubscription?.billing_interval || planRow.billing_interval,
    priceAmount: planRow.price_amount,
    monthlyBasePriceAmount: monthlyBasePlan?.price_amount ?? planRow.price_amount,
    yearlyDiscountPercent: monthlyBasePlan?.yearly_discount_percent ?? planRow.yearly_discount_percent ?? 0,
  });

  return {
    hasSubscription: true,
    planId: planRow.id,
    planName: planRow.plan_name,
    planCode: planRow.plan_code,
    planDescription: planRow.description ?? null,
    status: effectiveStatus,
    rawStatus: subscription.status,
    billingStatus: billingSubscription?.status ?? null,
    billingInterval: billingSubscription?.billing_interval || planRow.billing_interval,
    priceAmount: pricing.billedPriceAmount,
    monthlyBasePriceAmount: pricing.monthlyBasePriceAmount,
    yearlyDiscountPercent: pricing.yearlyDiscountPercent,
    yearlySavingAmount: pricing.yearlySavingAmount,
    equivalentMonthlyPriceAmount: pricing.equivalentMonthlyPriceAmount,
    trialEndsAt: subscription.trial_ends_at,
    trialDaysRemaining,
    currentPeriodStart: billingSubscription?.current_period_start || subscription.current_period_start,
    currentPeriodEnd: billingSubscription?.current_period_end || subscription.current_period_end,
    cycleStart,
    cycleEnd,
    cancelledAt: billingSubscription?.cancelled_at || subscription.cancelled_at,
    cancelAtPeriodEnd: Boolean(billingSubscription?.cancel_at_period_end),
    provider: billingSubscription?.provider ?? null,
    providerSubscriptionId: billingSubscription?.provider_subscription_id ?? null,
    providerPriceId: billingSubscription?.provider_price_id ?? null,
    providerManaged: Boolean(billingSubscription?.provider_subscription_id),
    manualAssignment: !billingSubscription?.provider_subscription_id && planRow.plan_code !== 'free_trial',
    monthlyAiCredits: planRow.monthly_ai_credits ?? 0,
    dailyAiRequestLimit: planRow.daily_ai_request_limit ?? 0,
    monthlyVoiceSeconds: planRow.monthly_voice_seconds ?? 0,
    monthlyReceiptExtractions: planRow.monthly_receipt_extractions ?? 0,
    receiptIntelligenceEnabled,
    textAiEnabled: Boolean(planRow.text_ai_enabled),
    voiceAiEnabled: Boolean(planRow.voice_ai_enabled),
    aiHistoryEnabled: Boolean(planRow.ai_history_enabled),
    creditsAllocated: usageCycle?.credits_allocated ?? 0,
    creditsConsumed: usageCycle?.credits_consumed ?? 0,
    creditsReserved: usageCycle?.credits_reserved ?? 0,
    creditsRefunded: usageCycle?.credits_refunded ?? 0,
    voiceSecondsUsed: usageCycle?.voice_seconds_used ?? 0,
    requestsToday: usageCycle?.requests_today ?? 0,
    receiptExtractionsIncluded: receiptIncluded,
    receiptExtractionsUsed: receiptUsed,
    receiptExtractionsReserved: receiptReserved,
    receiptExtractionsRefunded: usageCycle?.receipt_extractions_refunded ?? 0,
    receiptExtractionsRemaining: Math.max(0, receiptIncluded - receiptUsed - receiptReserved),
  };
}

export async function loadActivePublicPlans(): Promise<PublicSubscriptionPlan[]> {
  const supabase = createSubscriptionAdminClient() || createAnonServerClient();
  if (!supabase) {
    return [];
  }

  const [{ data: planRows, error: plansError }, { data: featureRows, error: featuresError }] = await Promise.all([
    supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('subscription_feature_limits')
      .select('plan_id, feature_key, feature_val'),
  ]);

  if (plansError) {
    throw plansError;
  }

  if (featuresError) {
    throw featuresError;
  }

  const normalizedFeatureRows = (featureRows as RawFeatureLimitRow[] | null) ?? [];
  const normalizedPlanRows = (planRows as RawPlanRow[] | null) ?? [];
  const monthlyBasePlansByCode = new Map(
    normalizedPlanRows
      .filter((row) => row.billing_interval === 'monthly')
      .map((row) => [row.plan_code, row] as const)
  );

  return normalizedPlanRows
    .map((row) => normalizePlan(row, normalizedFeatureRows, monthlyBasePlansByCode))
    .sort((left, right) => {
      const intervalRank = (value: SupportedBillingInterval) => {
        if (value === 'none') return 0;
        if (value === 'monthly') return 1;
        return 2;
      };

      return left.displayOrder - right.displayOrder
        || intervalRank(left.billingInterval) - intervalRank(right.billingInterval)
        || left.planName.localeCompare(right.planName);
    });
}

export async function getPublicPlansResponse(): Promise<SubscriptionPlansResponse> {
  const settings = await getPlatformSettingsSnapshot();
  const plans = await loadActivePublicPlans();
  return {
    plans,
    billing: getBillingAvailability(settings.publicUi.contactEmail),
  };
}

export async function getAuthenticatedSubscriptionSummary(userId: string): Promise<SubscriptionSummaryResponse> {
  const settings = await getPlatformSettingsSnapshot();
  const summary = await loadSummaryForUser(userId);
  return {
    summary,
    billing: getBillingAvailability(settings.publicUi.contactEmail),
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

  let summary = await loadSummaryForUser(userId);
  if (summary.hasSubscription) {
    return {
      summary,
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

  summary = await loadSummaryForUser(userId);

  if (initTrial.initialized) {
    try {
      const [{ data: profile }, { data: sub }] = await Promise.all([
        admin.from('user_profiles').select('email,full_name').eq('id', userId).maybeSingle(),
        admin.from('user_subscriptions').select('id,trial_started_at,trial_ends_at').eq('user_id', userId).maybeSingle(),
      ]);

      const customerEmail = ((profile as any)?.email as string) || '';
      const customerName = ((profile as any)?.full_name as string) || '';
      const subscriptionId = ((sub as any)?.id as string) || null;
      const trialStartedAt = ((sub as any)?.trial_started_at as string | null) || null;
      const trialEndsAt = ((sub as any)?.trial_ends_at as string | null) || summary.trialEndsAt || null;

      if (customerEmail) {
        const endDate = trialEndsAt ? String(trialEndsAt).slice(0, 10) : '';
        const startDate = trialStartedAt ? String(trialStartedAt).slice(0, 10) : '';
        const tasks = [
          sendTransactionalEmail({
            eventKey: `customer_trial_started:${userId}:${endDate || 'unknown'}`,
            templateKey: 'customer_trial_started',
            to: { email: customerEmail, name: customerName },
            userId,
            subscriptionId,
            variables: {
              customer_name: customerName || customerEmail.split('@')[0] || 'there',
              customer_email: customerEmail,
              trial_start_date: startDate,
              trial_end_date: endDate,
              plan_name: summary.planName || '',
            },
          }),
          sendTransactionalEmail({
            eventKey: `admin_trial_started:${userId}:${endDate || 'unknown'}`,
            templateKey: 'admin_trial_started',
            to: { email: customerEmail, name: customerName },
            userId,
            subscriptionId,
            variables: {
              customer_name: customerName || customerEmail.split('@')[0] || 'Unknown',
              customer_email: customerEmail,
              trial_start_date: startDate,
              trial_end_date: endDate,
              plan_name: summary.planName || '',
            },
          }),
        ];

        await Promise.race([
          Promise.allSettled(tasks),
          new Promise<void>((resolve) => setTimeout(resolve, 1200)),
        ]);
      }
    } catch {
    }
  }

  return {
    summary,
    initResult: initTrial.initialized ? 'initialized' : 'empty',
    errorMessage: null,
  };
}

export async function ensureUserSubscriptionSummaryWithUserClient(
  userId: string,
  _userSupabase: SupabaseClient
): Promise<EnsureSummaryResult> {
  return ensureUserSubscriptionSummary(userId);
}

function buildBillingError(code: BillingActionError['code'], message: string): BillingActionError {
  return { code, message };
}

export async function validateRequestedPlanSelection(
  userId: string,
  planCode: PublicSubscriptionPlan['planCode'],
  billingInterval: SupportedBillingInterval
) {
  const plans = await loadActivePublicPlans();
  const selectedPlan = plans.find((plan) => plan.planCode === planCode && plan.billingInterval === billingInterval);

  if (!selectedPlan) {
    return {
      ok: false as const,
      error: buildBillingError('invalid_plan', 'Selected plan was not found.'),
    };
  }

  if (!selectedPlan.isActive) {
    return {
      ok: false as const,
      error: buildBillingError('inactive_plan', 'Selected plan is inactive.'),
    };
  }

  const summary = (await ensureUserSubscriptionSummary(userId)).summary;
  if (
    summary.hasSubscription
    && summary.planCode === selectedPlan.planCode
    && summary.billingInterval === billingInterval
    && (summary.status === 'active' || summary.status === 'trialing' || summary.status === 'past_due')
  ) {
    return {
      ok: false as const,
      error: buildBillingError('same_plan_selected', 'This plan is already active.'),
    };
  }

  return {
    ok: true as const,
    plan: selectedPlan,
    summary,
  };
}

async function createCheckoutSessionRecord(
  admin: SupabaseClient,
  input: Pick<AuthenticatedCheckoutInput, 'userId' | 'billingInterval' | 'successUrl' | 'cancelUrl'>,
  planId: string,
  providerName: string
) {
  const { data, error } = await admin
    .from('billing_checkout_sessions')
    .insert({
      user_id: input.userId,
      plan_id: planId,
      billing_interval: input.billingInterval,
      provider: providerName,
      status: 'pending',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    })
    .select('id')
    .single();

  if (error) {
    throw error;
  }

  return data.id as string;
}

async function updateCheckoutSessionRecord(
  admin: SupabaseClient,
  checkoutSessionId: string,
  updates: Record<string, unknown>
) {
  const { error } = await admin
    .from('billing_checkout_sessions')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', checkoutSessionId);

  if (error) {
    throw error;
  }
}

async function loadProviderManagedSubscription(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as RawBillingSubscriptionRow | null;
}

export async function initiateCheckoutForUser(input: AuthenticatedCheckoutInput): Promise<BillingCheckoutResponse> {
  const admin = createSubscriptionAdminClient();
  if (!admin) {
    return {
      ok: false,
      error: buildBillingError('billing_provider_unavailable', 'Billing provider is not configured.'),
    };
  }

  const validation = await validateRequestedPlanSelection(input.userId, input.planCode, input.billingInterval);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const provider = getBillingProvider();
  const checkoutSessionId = await createCheckoutSessionRecord(admin, input, validation.plan.id, provider.name);

  if (!provider.configured) {
    await updateCheckoutSessionRecord(admin, checkoutSessionId, {
      status: 'provider_unavailable',
      metadata: { reason: 'billing_provider_unavailable' },
    });
    return {
      ok: false,
      sessionId: checkoutSessionId,
      error: buildBillingError('billing_provider_unavailable', 'Billing provider is not configured.'),
    };
  }

  try {
    const result = await provider.createCheckoutSession({
      userId: input.userId,
      email: input.email,
      planId: validation.plan.id,
      planCode: validation.plan.planCode,
      planName: validation.plan.planName,
      billingInterval: input.billingInterval,
      priceAmount: validation.plan.priceAmount,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      checkoutSessionId,
    });

    await updateCheckoutSessionRecord(admin, checkoutSessionId, {
      status: 'ready',
      provider_session_id: result.providerSessionId,
      metadata: {
        providerPriceId: result.providerPriceId ?? null,
      },
    });

    return {
      ok: true,
      sessionId: checkoutSessionId,
      checkoutUrl: result.checkoutUrl,
    };
  } catch (error) {
    await updateCheckoutSessionRecord(admin, checkoutSessionId, {
      status: 'failed',
      metadata: {
        reason: error instanceof Error ? error.message : 'checkout_creation_failed',
      },
    });

    return {
      ok: false,
      sessionId: checkoutSessionId,
      error: buildBillingError('checkout_creation_failed', 'Checkout could not be created.'),
    };
  }
}

export async function createCustomerPortalForUser(
  userId: string,
  email: string | null,
  returnUrl: string
): Promise<BillingPortalResponse> {
  const admin = createSubscriptionAdminClient();
  if (!admin) {
    return {
      ok: false,
      error: buildBillingError('billing_provider_unavailable', 'Billing provider is not configured.'),
    };
  }

  const providerSubscription = await loadProviderManagedSubscription(admin, userId);
  if (!providerSubscription) {
    return {
      ok: false,
      error: buildBillingError('subscription_not_found', 'Provider-managed subscription was not found.'),
    };
  }

  const provider = getBillingProvider();
  if (!provider.configured || !provider.createCustomerPortal) {
    return {
      ok: false,
      error: buildBillingError('billing_provider_unavailable', 'Billing provider customer portal is not available.'),
    };
  }

  try {
    const { data: customer } = await admin
      .from('billing_customers')
      .select('provider_customer_id')
      .eq('user_id', userId)
      .eq('provider', providerSubscription.provider)
      .maybeSingle();

    const portal = await provider.createCustomerPortal({
      userId,
      email,
      returnUrl,
      providerCustomerId: customer?.provider_customer_id ?? null,
      providerSubscriptionId: providerSubscription.provider_subscription_id,
    });

    return {
      ok: true,
      portalUrl: portal.portalUrl,
    };
  } catch {
    return {
      ok: false,
      error: buildBillingError('billing_provider_unavailable', 'Billing provider customer portal is not available.'),
    };
  }
}

export async function cancelSubscriptionAtPeriodEnd(userId: string): Promise<BillingMutationResponse> {
  const admin = createSubscriptionAdminClient();
  if (!admin) {
    return {
      ok: false,
      error: buildBillingError('billing_provider_unavailable', 'Billing provider is not configured.'),
    };
  }

  const providerSubscription = await loadProviderManagedSubscription(admin, userId);
  if (!providerSubscription) {
    return {
      ok: false,
      error: buildBillingError('subscription_not_found', 'Provider-managed subscription was not found.'),
    };
  }

  const provider = getBillingProvider();
  if (!provider.configured || !provider.cancelSubscription) {
    return {
      ok: false,
      error: buildBillingError('billing_provider_unavailable', 'Billing provider cancellation is not available.'),
    };
  }

  try {
    await provider.cancelSubscription({
      userId,
      providerSubscriptionId: providerSubscription.provider_subscription_id,
      cancelAtPeriodEnd: true,
    });
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: buildBillingError('billing_provider_unavailable', 'Billing provider cancellation is not available.'),
    };
  }
}

export async function resumeSubscription(userId: string): Promise<BillingMutationResponse> {
  const admin = createSubscriptionAdminClient();
  if (!admin) {
    return {
      ok: false,
      error: buildBillingError('billing_provider_unavailable', 'Billing provider is not configured.'),
    };
  }

  const providerSubscription = await loadProviderManagedSubscription(admin, userId);
  if (!providerSubscription) {
    return {
      ok: false,
      error: buildBillingError('subscription_not_found', 'Provider-managed subscription was not found.'),
    };
  }

  const provider = getBillingProvider();
  if (!provider.configured || !provider.resumeSubscription) {
    return {
      ok: false,
      error: buildBillingError('billing_provider_unavailable', 'Billing provider resume is not available.'),
    };
  }

  try {
    await provider.resumeSubscription({
      userId,
      providerSubscriptionId: providerSubscription.provider_subscription_id,
    });
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: buildBillingError('billing_provider_unavailable', 'Billing provider resume is not available.'),
    };
  }
}

async function markBillingEvent(
  admin: SupabaseClient,
  provider: string,
  eventId: string,
  updates: Record<string, unknown>
) {
  const { error } = await admin
    .from('billing_events')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('provider', provider)
    .eq('provider_event_id', eventId);

  if (error) {
    throw error;
  }
}

async function applyVerifiedSubscriptionState(
  admin: SupabaseClient,
  event: VerifiedBillingEvent
) {
  if (!event.subscription) {
    return;
  }

  const payload = event.subscription;
  const { error } = await admin.rpc('apply_billing_subscription_state', {
    p_user_id: payload.userId,
    p_plan_code: payload.planCode,
    p_provider: event.provider,
    p_provider_customer_id: payload.providerCustomerId,
    p_provider_subscription_id: payload.providerSubscriptionId,
    p_provider_price_id: payload.providerPriceId ?? null,
    p_status: payload.status,
    p_billing_interval: payload.billingInterval,
    p_current_period_start: payload.currentPeriodStart,
    p_current_period_end: payload.currentPeriodEnd,
    p_cancel_at_period_end: payload.cancelAtPeriodEnd,
    p_cancelled_at: payload.cancelledAt ?? null,
    p_metadata: payload.metadata ?? {},
    p_preserve_existing_usage: true,
  });

  if (error) {
    throw error;
  }
}

function toIsoDate(value: string | Date | null | undefined) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function toCurrencyCode(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().toUpperCase();
}

function readPayloadString(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function readPayloadNumber(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function rankPlanCode(value: unknown) {
  const plan = typeof value === 'string' ? value : '';
  if (plan === 'free_trial') return 0;
  if (plan === 'personal') return 1;
  if (plan === 'family') return 2;
  return 0;
}

async function loadUserEmailContext(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from('user_profiles')
    .select('email,full_name')
    .eq('id', userId)
    .maybeSingle();
  const email = ((data as any)?.email as string) || '';
  const name = ((data as any)?.full_name as string) || '';
  return { email, name };
}

async function loadUserSubscriptionSnapshot(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from('user_subscriptions')
    .select('id,status,current_period_start,current_period_end,trial_started_at,trial_ends_at,subscription_plans(plan_code,plan_name,price_amount,billing_interval)')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return null;

  const plan = (data as any).subscription_plans;
  const planRow = Array.isArray(plan) ? plan[0] : plan;

  return {
    subscriptionId: (data as any).id as string,
    status: ((data as any).status as string) || '',
    currentPeriodStart: ((data as any).current_period_start as string | null) || null,
    currentPeriodEnd: ((data as any).current_period_end as string | null) || null,
    trialStartedAt: ((data as any).trial_started_at as string | null) || null,
    trialEndsAt: ((data as any).trial_ends_at as string | null) || null,
    planCode: (planRow as any)?.plan_code as string | null | undefined,
    planName: (planRow as any)?.plan_name as string | null | undefined,
    priceAmount: (planRow as any)?.price_amount as number | string | null | undefined,
    billingInterval: (planRow as any)?.billing_interval as string | null | undefined,
  };
}

async function sendBillingEmails(args: {
  admin: SupabaseClient;
  event: VerifiedBillingEvent;
  paymentId: string | null;
  userId: string;
  before: Awaited<ReturnType<typeof loadUserSubscriptionSnapshot>> | null;
  after: Awaited<ReturnType<typeof loadUserSubscriptionSnapshot>> | null;
}) {
  const userId = args.userId;
  const payload = args.event.payload || {};
  const user = await loadUserEmailContext(args.admin, userId).catch(() => ({ email: '', name: '' }));
  const customerEmail = user.email || '';
  const customerName = user.name || (customerEmail ? customerEmail.split('@')[0] : '');
  const subscriptionId = args.after?.subscriptionId || args.before?.subscriptionId || null;

  const planName = args.after?.planName || args.before?.planName || '';
  const planCodeBefore = args.before?.planCode || '';
  const planCodeAfter = args.after?.planCode || planCodeBefore;
  const statusBefore = args.before?.status || '';
  const statusAfter = args.after?.status || statusBefore;
  const periodEndAfter = args.after?.currentPeriodEnd || null;
  const renewalDate = periodEndAfter ? toIsoDate(periodEndAfter) : '';

  const amountNumber = readPayloadNumber(payload, ['amount', 'amount_total', 'amount_paid', 'total', 'price', 'unit_amount']);
  const currency = toCurrencyCode(readPayloadString(payload, ['currency', 'currency_code']));
  const invoiceNumber = readPayloadString(payload, ['invoice_number', 'invoice', 'number']);
  const paymentReference = readPayloadString(payload, ['payment_reference', 'payment_intent', 'charge', 'id', 'reference']);

  const variables = {
    customer_name: customerName || 'there',
    customer_email: customerEmail,
    plan_name: planName,
    amount: amountNumber === null ? '' : String(amountNumber),
    currency,
    renewal_date: renewalDate,
    invoice_number: invoiceNumber,
    payment_reference: paymentReference,
    subscription_end_date: renewalDate,
  };

  const baseKey = `billing:${args.event.provider}:${args.event.eventId}`;

  const shouldSend = (key: string) => Boolean(key);
  const send = async (templateKey: string) => {
    if (!shouldSend(templateKey)) return;
    await sendTransactionalEmail({
      eventKey: `${baseKey}:${templateKey}`,
      templateKey,
      to: { email: customerEmail, name: customerName },
      userId,
      subscriptionId: subscriptionId,
      paymentId: args.paymentId,
      variables,
    });
  };

  const afterRank = rankPlanCode(planCodeAfter);
  const beforeRank = rankPlanCode(planCodeBefore);
  const planChanged = Boolean(planCodeBefore && planCodeAfter && planCodeBefore !== planCodeAfter);

  const converted = statusBefore === 'trialing' && statusAfter === 'active';
  const resumed = statusAfter === 'active' && (statusBefore === 'cancelled' || statusBefore === 'paused');
  const activated = statusAfter === 'active'
    && statusBefore !== 'active'
    && statusBefore !== 'trialing'
    && !resumed;
  const cancelled = statusAfter === 'cancelled' && statusBefore !== 'cancelled';
  const expired = statusAfter === 'expired' && statusBefore !== 'expired';
  const paymentFailed = statusAfter === 'past_due' || args.event.eventType.toLowerCase().includes('failed');
  const refunded = args.event.eventType.toLowerCase().includes('refund');

  if (converted) {
    await send('customer_trial_converted');
  }

  if (activated) {
    await send('customer_package_purchased');
    await send('customer_package_activated');
    await send('admin_new_package_purchase');
    await send('admin_payment_successful');
  }

  if (resumed) {
    await send('customer_subscription_resumed');
  }

  if (planChanged && statusAfter === 'active') {
    if (afterRank > beforeRank) {
      await send('customer_package_upgraded');
      await send('admin_subscription_upgraded');
    } else if (afterRank < beforeRank) {
      await send('customer_package_downgraded');
      await send('admin_subscription_downgraded');
    }
  }

  if (!activated && statusAfter === 'active' && args.before?.currentPeriodEnd && args.after?.currentPeriodEnd && args.before.currentPeriodEnd !== args.after.currentPeriodEnd) {
    await send('customer_subscription_renewed');
    await send('admin_payment_successful');
  }

  if (paymentFailed) {
    await send('customer_payment_failed');
    await send('admin_payment_failed');
  }

  if (cancelled) {
    await send('customer_subscription_cancelled');
    await send('admin_subscription_cancelled');
  }

  if (expired) {
    await send('customer_subscription_expired');
  }

  if (refunded) {
    await send('customer_refund_processed');
    await send('admin_refund_processed');
  }
}

export async function processVerifiedBillingEvent(event: VerifiedBillingEvent) {
  const admin = createSubscriptionAdminClient();
  if (!admin) {
    return {
      ok: false as const,
      error: buildBillingError('billing_provider_unavailable', 'Billing provider is not configured.'),
    };
  }

  const before = event.subscription?.userId
    ? await loadUserSubscriptionSnapshot(admin, event.subscription.userId).catch(() => null)
    : null;

  const { data: billingRow, error: insertError } = await admin
    .from('billing_events')
    .insert({
      provider: event.provider,
      provider_event_id: event.eventId,
      event_type: event.eventType,
      payload: event.payload,
      processing_status: 'processing',
    })
    .select('id')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return {
        ok: false as const,
        error: buildBillingError('duplicate_billing_event', 'Billing event was already processed.'),
      };
    }

    throw insertError;
  }

  try {
    await applyVerifiedSubscriptionState(admin, event);
    await markBillingEvent(admin, event.provider, event.eventId, {
      processing_status: 'processed',
      processed_at: new Date().toISOString(),
      error_message: null,
    });

    const after = event.subscription?.userId
      ? await loadUserSubscriptionSnapshot(admin, event.subscription.userId).catch(() => null)
      : null;

    if (event.subscription?.userId) {
      const paymentId = (billingRow as any)?.id as string | null | undefined;
      await sendBillingEmails({
        admin,
        event,
        paymentId: paymentId || null,
        userId: event.subscription.userId,
        before,
        after,
      }).catch(() => {});
    }

    return { ok: true as const };
  } catch (error) {
    await markBillingEvent(admin, event.provider, event.eventId, {
      processing_status: 'failed',
      processed_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : 'subscription_activation_failed',
    });

    await sendTransactionalEmail({
      eventKey: `billing_webhook_failed:${event.provider}:${event.eventId}`,
      templateKey: 'admin_payment_webhook_failed',
      to: { email: 'no-reply@1smartpocket.com', name: 'System' },
      paymentId: (billingRow as any)?.id as string | null | undefined,
      variables: {
        event_type: event.eventType,
      },
    }).catch(() => {});

    return {
      ok: false as const,
      error: buildBillingError('subscription_activation_failed', 'Subscription activation failed.'),
    };
  }
}

export async function verifyBillingWebhook(providerName: string, request: Request) {
  let provider: BillingProvider;

  try {
    provider = getBillingProvider();
  } catch {
    return {
      ok: false as const,
      error: buildBillingError('billing_provider_unavailable', 'Billing provider is not configured.'),
    };
  }

  if (!provider.configured || provider.name !== providerName) {
    return {
      ok: false as const,
      error: buildBillingError('billing_provider_unavailable', 'Billing provider is not configured.'),
    };
  }

  try {
    const verifiedEvent = await provider.verifyWebhook(request);
    return { ok: true as const, event: verifiedEvent };
  } catch {
    return {
      ok: false as const,
      error: buildBillingError('invalid_webhook_signature', 'Webhook signature is invalid.'),
    };
  }
}
