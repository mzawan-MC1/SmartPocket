import { NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { getReceivedSpaceInvitations, toInvitationErrorResponse } from '@/lib/spaces-invitations-server';

export const runtime = 'nodejs';

async function requireUser() {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false as const,
      response: applySupabaseCookies(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        cookieMutations
      ),
    };
  }

  return { ok: true as const, cookieMutations, user };
}

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const email = auth.user.email?.trim().toLowerCase();
    if (!email) {
      return applySupabaseCookies(
        NextResponse.json({ invitations: [] }, { status: 200 }),
        auth.cookieMutations
      );
    }

    const invitations = await getReceivedSpaceInvitations({
      userId: auth.user.id,
      email,
    });

    return applySupabaseCookies(
      NextResponse.json({ invitations }, { status: 200 }),
      auth.cookieMutations
    );
  } catch (error) {
    const { status, body } = toInvitationErrorResponse(error);
    return applySupabaseCookies(
      NextResponse.json(body, { status }),
      auth.cookieMutations
    );
  }
}
