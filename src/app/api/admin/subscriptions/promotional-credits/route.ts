import { NextResponse } from 'next/server';
import { buildSupportResponse, requireAdminRouteUser } from '@/lib/support-server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  AdminUserIdentifierError,
  resolveUserIdentifier,
  type ResolvedUser,
} from '@/lib/subscription/admin-user-resolver';

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type PromotionalCreditsBody = {
  identifier?: string;
  credits?: number;
  notes?: string;
};

type PromotionalCreditsResponse = {
  ok: boolean;
  message?: string;
  target?: ResolvedUser;
  balance?: {
    currentBalance: number;
    creditsAdded: number;
    resultingBalance: number;
  };
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
  } satisfies PromotionalCreditsResponse, { status: args.status });
}

async function loadAvailableCredits(admin: AdminClient, userId: string) {
  const { data, error } = await admin
    .from('ai_usage_cycles')
    .select('credits_allocated,credits_consumed,credits_reserved')
    .eq('user_id', userId)
    .order('cycle_end', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const allocated = Number(data?.credits_allocated ?? 0);
  const consumed = Number(data?.credits_consumed ?? 0);
  const reserved = Number(data?.credits_reserved ?? 0);
  return allocated - consumed - reserved;
}

async function enrichLatestPromotionalLog(args: {
  admin: AdminClient;
  adminUserId: string;
  target: ResolvedUser;
  credits: number;
  notes: string;
}) {
  const { data, error } = await args.admin
    .from('billing_admin_override_logs')
    .select('id,details')
    .eq('admin_user_id', args.adminUserId)
    .eq('target_user_id', args.target.userId)
    .eq('action_type', 'grant_promotional_credits')
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
        credits: args.credits,
        notes: args.notes,
        target_email: args.target.email,
        target_display_name: args.target.displayName,
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
    const body = (await request.json().catch(() => ({}))) as PromotionalCreditsBody;
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
    const notes = typeof body.notes === 'string' && body.notes.trim()
      ? body.notes.trim()
      : 'Admin promotional grant';

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

    if (
      typeof body.credits !== 'number'
      || !Number.isFinite(body.credits)
      || !Number.isInteger(body.credits)
      || body.credits <= 0
    ) {
      return buildSupportResponse(
        buildErrorResponse({
          code: 'invalid_credits',
          message: 'Enter a valid whole-number credit amount.',
          status: 400,
        }),
        auth.cookieMutations
      );
    }

    const target = await resolveUserIdentifier(identifier, { admin: auth.admin });
    const { error } = await auth.supabase.rpc('admin_grant_promotional_credits', {
      p_admin_id: auth.user.id,
      p_user_id: target.userId,
      p_credits: body.credits,
      p_notes: notes,
    });

    if (error) {
      throw error;
    }

    const resultingBalance = await loadAvailableCredits(auth.admin, target.userId).catch(() => null);
    await enrichLatestPromotionalLog({
      admin: auth.admin,
      adminUserId: auth.user.id,
      target,
      credits: body.credits,
      notes,
    });

    const targetLabel = target.email || `${target.userId.slice(-8)}`;
    return buildSupportResponse(
      NextResponse.json({
        ok: true,
        message: `${body.credits} promotional credits granted to ${targetLabel}.`,
        target,
        balance: resultingBalance === null
          ? undefined
          : {
              currentBalance: Math.max(0, resultingBalance - body.credits),
              creditsAdded: body.credits,
              resultingBalance,
            },
      } satisfies PromotionalCreditsResponse),
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
        code: 'grant_promotional_credits_failed',
        message: 'Failed to grant promotional credits.',
        status: 500,
      }),
      auth.cookieMutations
    );
  }
}
