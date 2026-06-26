import { NextResponse } from 'next/server';
import { quoteAuthenticatedAiTopUpSelection } from '@/lib/subscription/topups-server';
import type { AiTopUpSelectionInput } from '@/lib/subscription/types';
import {
  applySupabaseCookies,
  createRouteHandlerSupabaseClient,
} from '@/lib/supabase/server';

type QuoteBody = {
  lines?: AiTopUpSelectionInput[];
};

export async function POST(request: Request) {
  try {
    const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        cookieMutations
      );
    }

    const body = (await request.json().catch(() => ({}))) as QuoteBody;
    const payload = await quoteAuthenticatedAiTopUpSelection(user.id, body.lines ?? []);

    return applySupabaseCookies(
      NextResponse.json(payload, { status: payload.ok ? 200 : 400 }),
      cookieMutations
    );
  } catch (error) {
    console.error('[subscription/topups/quote] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({
      ok: false,
      error: {
        code: 'invalid_topup_selection',
        message: 'Unable to quote the selected top-ups.',
      },
    }, { status: 500 });
  }
}
