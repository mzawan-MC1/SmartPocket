import { NextResponse } from 'next/server';
import { buildSupportResponse, requireAdminRouteUser } from '@/lib/support-server';
import { createAdminAiTopUpAdjustment } from '@/lib/subscription/topups-server';
import type { AiTopUpProduct } from '@/lib/subscription/types';

type AdjustmentBody = {
  userId?: string;
  resourceType?: Exclude<AiTopUpProduct['resourceType'], 'bundle'>;
  quantityDelta?: number;
  reason?: string;
};

export async function POST(request: Request) {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as AdjustmentBody;
    const quantityDelta = body.quantityDelta;

    if (
      !body.userId
      || !body.resourceType
      || typeof quantityDelta !== 'number'
      || !Number.isFinite(quantityDelta)
      || !Number.isInteger(quantityDelta)
      || quantityDelta === 0
      || !body.reason?.trim()
    ) {
      return buildSupportResponse(
        NextResponse.json({
          ok: false,
          error: {
            code: 'adjustment_failed',
            message: 'User, resource, quantity delta, and reason are required.',
          },
        }, { status: 400 }),
        auth.cookieMutations
      );
    }

    const payload = await createAdminAiTopUpAdjustment({
      adminUserId: auth.user.id,
      userId: body.userId,
      resourceType: body.resourceType,
      quantityDelta,
      reason: body.reason.trim(),
    });

    return buildSupportResponse(
      NextResponse.json(payload, { status: payload.ok ? 200 : 400 }),
      auth.cookieMutations
    );
  } catch (error) {
    return buildSupportResponse(
      NextResponse.json({
        ok: false,
        error: {
          code: 'adjustment_failed',
          message: error instanceof Error ? error.message : 'Failed to adjust top-up balance.',
        },
      }, { status: 500 }),
      auth.cookieMutations
    );
  }
}
