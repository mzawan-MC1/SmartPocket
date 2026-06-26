import { NextResponse } from 'next/server';
import { buildSupportResponse, requireAdminRouteUser } from '@/lib/support-server';
import { getAdminAiTopUpOrders } from '@/lib/subscription/topups-server';

export async function GET() {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const payload = await getAdminAiTopUpOrders();
    return buildSupportResponse(
      NextResponse.json(payload, { status: 200 }),
      auth.cookieMutations
    );
  } catch (error) {
    return buildSupportResponse(
      NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load top-up orders.' }, { status: 500 }),
      auth.cookieMutations
    );
  }
}
