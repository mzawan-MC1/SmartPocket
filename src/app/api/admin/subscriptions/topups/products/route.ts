import { NextResponse } from 'next/server';
import { requireAdminRouteUser } from '@/lib/support-server';
import { getAdminAiTopUpCatalog, saveAdminAiTopUpProduct } from '@/lib/subscription/topups-server';
import type { AiTopUpProduct } from '@/lib/subscription/types';
import { buildSupportResponse } from '@/lib/support-server';

export async function GET() {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const payload = await getAdminAiTopUpCatalog();
    return buildSupportResponse(
      NextResponse.json(payload, { status: 200 }),
      auth.cookieMutations
    );
  } catch (error) {
    return buildSupportResponse(
      NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load top-up products.' }, { status: 500 }),
      auth.cookieMutations
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Partial<AiTopUpProduct>;
    const product = await saveAdminAiTopUpProduct(body);
    return buildSupportResponse(
      NextResponse.json({ product }, { status: 200 }),
      auth.cookieMutations
    );
  } catch (error) {
    return buildSupportResponse(
      NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save top-up product.' }, { status: 500 }),
      auth.cookieMutations
    );
  }
}
