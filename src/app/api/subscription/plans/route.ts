import { NextResponse } from 'next/server';
import { getPublicPlansResponse } from '@/lib/subscription/server';

export async function GET() {
  try {
    const payload = await getPublicPlansResponse();
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error('[subscription/plans] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to load plans.' }, { status: 500 });
  }
}
