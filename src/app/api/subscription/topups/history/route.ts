import { NextResponse } from 'next/server';
import { getAuthenticatedAiTopUpHistory } from '@/lib/subscription/topups-server';
import {
  applySupabaseCookies,
  createRouteHandlerSupabaseClient,
} from '@/lib/supabase/server';

export async function GET() {
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

    const payload = await getAuthenticatedAiTopUpHistory(user.id);
    return applySupabaseCookies(
      NextResponse.json(payload, { status: 200 }),
      cookieMutations
    );
  } catch (error) {
    console.error('[subscription/topups/history] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to load top-up history.' }, { status: 500 });
  }
}
