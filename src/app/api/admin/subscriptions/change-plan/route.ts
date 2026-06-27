import { NextResponse } from 'next/server';
import { buildSupportResponse, requireAdminRouteUser } from '@/lib/support-server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  AdminUserIdentifierError,
  resolveUserIdentifier,
  type ResolvedUser,
} from '@/lib/subscription/admin-user-resolver';

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type ChangePlanBody = {
  identifier?: string;
  planCode?: string;
  billingInterval?: 'monthly' | 'yearly';
};

type PlanSummary = {
  planCode: string;
  planName: string | null;
  billingInterval: 'monthly' | 'yearly' | null;
};

type ChangePlanResponse = {
  ok: boolean;
  message?: string;
  target?: ResolvedUser;
  currentPlan?: PlanSummary | null;
  newPlan?: PlanSummary | null;
  error?: {
    code: string;
    message: string;
  };
};

function buildErrorResponse(args: {
  code: string;
  message: string;
  status: number;
}) {
  return NextResponse.json({
    ok: false,
    error: {
      code: args.code,
      message: args.message,
    },
  } satisfies ChangePlanResponse, { status: args.status });
}

async function loadPlanSummary(admin: AdminClient, userId: string): Promise<PlanSummary | null> {
  const { data, error } = await admin
    .from('user_subscriptions')
    .select(`
      subscription_plans!inner(
        plan_code,
        plan_name,
        billing_interval
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const planRow = Array.isArray(data?.subscription_plans)
    ? data.subscription_plans[0]
    : data?.subscription_plans;

  if (!planRow) {
    return null;
  }

  return {
    planCode: String(planRow.plan_code ?? ''),
    planName: typeof planRow.plan_name === 'string' ? planRow.plan_name : null,
    billingInterval: planRow.billing_interval === 'yearly' ? 'yearly' : 'monthly',
  };
}

async function loadRequestedPlanSummary(admin: AdminClient, planCode: string, billingInterval: 'monthly' | 'yearly'): Promise<PlanSummary | null> {
  const { data, error } = await admin
    .from('subscription_plans')
    .select('plan_code,plan_name,billing_interval')
    .eq('plan_code', planCode)
    .eq('billing_interval', billingInterval)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    planCode: String(data.plan_code ?? planCode),
    planName: typeof data.plan_name === 'string' ? data.plan_name : null,
    billingInterval: data.billing_interval === 'yearly' ? 'yearly' : 'monthly',
  };
}

async function enrichLatestPlanChangeLog(args: {
  admin: AdminClient;
  adminUserId: string;
  target: ResolvedUser;
  newPlan: PlanSummary | null;
  currentPlan: PlanSummary | null;
}) {
  const { data, error } = await args.admin
    .from('billing_admin_override_logs')
    .select('id,details')
    .eq('admin_user_id', args.adminUserId)
    .eq('target_user_id', args.target.userId)
    .eq('action_type', 'change_plan')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) {
    return;
  }

  const currentDetails = (data.details && typeof data.details === 'object' && !Array.isArray(data.details))
    ? data.details as Record<string, unknown>
    : {};

  await args.admin
    .from('billing_admin_override_logs')
    .update({
      details: {
        ...currentDetails,
        target_email: args.target.email,
        target_display_name: args.target.displayName,
        previous_plan_code: args.currentPlan?.planCode ?? null,
        previous_billing_interval: args.currentPlan?.billingInterval ?? null,
        new_plan_code: args.newPlan?.planCode ?? null,
        new_billing_interval: args.newPlan?.billingInterval ?? null,
      },
    })
    .eq('id', data.id);
}

export async function POST(request: Request) {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as ChangePlanBody;
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
    const planCode = typeof body.planCode === 'string' ? body.planCode.trim() : '';
    const billingInterval = body.billingInterval === 'yearly' ? 'yearly' : body.billingInterval === 'monthly' ? 'monthly' : null;

    if (!identifier) {
      return buildSupportResponse(
        buildErrorResponse({
          code: 'invalid_user_identifier',
          message: 'Enter a valid email address or user UUID.',
          status: 400,
        }),
        auth.cookieMutations
      );
    }

    if (!planCode || !billingInterval) {
      return buildSupportResponse(
        buildErrorResponse({
          code: 'invalid_plan_selection',
          message: 'Select a valid plan and billing interval.',
          status: 400,
        }),
        auth.cookieMutations
      );
    }

    const target = await resolveUserIdentifier(identifier, { admin: auth.admin });
    const currentPlan = await loadPlanSummary(auth.admin, target.userId);
    const requestedPlan = await loadRequestedPlanSummary(auth.admin, planCode, billingInterval);

    if (!requestedPlan) {
      return buildSupportResponse(
        buildErrorResponse({
          code: 'plan_not_found',
          message: 'The selected plan could not be found.',
          status: 404,
        }),
        auth.cookieMutations
      );
    }

    const { error } = await auth.supabase.rpc('admin_change_user_plan', {
      p_admin_id: auth.user.id,
      p_user_id: target.userId,
      p_plan_code: requestedPlan.planCode,
      p_billing_interval: requestedPlan.billingInterval,
    });

    if (error) {
      throw error;
    }

    await enrichLatestPlanChangeLog({
      admin: auth.admin,
      adminUserId: auth.user.id,
      target,
      currentPlan,
      newPlan: requestedPlan,
    });

    const targetLabel = target.email || `${target.userId.slice(-8)}`;
    return buildSupportResponse(
      NextResponse.json({
        ok: true,
        message: `${targetLabel} was changed to the ${requestedPlan.planName || requestedPlan.planCode} ${requestedPlan.billingInterval} plan.`,
        target,
        currentPlan,
        newPlan: requestedPlan,
      } satisfies ChangePlanResponse),
      auth.cookieMutations
    );
  } catch (error) {
    if (error instanceof AdminUserIdentifierError) {
      const status = error.code === 'user_not_found'
        ? 404
        : error.code === 'ambiguous_user'
          ? 409
          : 400;

      return buildSupportResponse(
        buildErrorResponse({
          code: error.code,
          message: error.message,
          status,
        }),
        auth.cookieMutations
      );
    }

    return buildSupportResponse(
      buildErrorResponse({
        code: 'change_plan_failed',
        message: 'Failed to change the user plan.',
        status: 500,
      }),
      auth.cookieMutations
    );
  }
}
