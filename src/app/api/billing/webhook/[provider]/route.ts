import { NextResponse } from 'next/server';
import { processVerifiedBillingEvent, verifyBillingWebhook } from '@/lib/subscription/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  try {
    const verified = await verifyBillingWebhook(provider, request);
    if (!verified.ok) {
      const isSignatureError = verified.error.code === 'invalid_webhook_signature';
      return NextResponse.json(
        { ok: false, error: verified.error },
        { status: isSignatureError ? 400 : 503 }
      );
    }

    const processed = await processVerifiedBillingEvent(verified.event);
    if (!processed.ok) {
      const status = processed.error.code === 'duplicate_billing_event' ? 200 : 400;
      return NextResponse.json({ ok: false, error: processed.error }, { status });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error(`[billing/webhook/${provider}] Error:`, error instanceof Error ? error.message : error);
    return NextResponse.json({
      ok: false,
      error: {
        code: 'subscription_activation_failed',
        message: 'Webhook processing failed.',
      },
    }, { status: 500 });
  }
}
