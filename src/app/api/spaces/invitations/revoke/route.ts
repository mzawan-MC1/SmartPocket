import { NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { revokeSpaceInvitation, toInvitationErrorResponse } from '@/lib/spaces-invitations-server';
import { requireSharedSpacesAccess } from '@/lib/subscription/server';

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

  return { ok: true as const, supabase, cookieMutations, user };
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const access = await requireSharedSpacesAccess(auth.user.id, { skipUsageCheck: true });
  if (!access.ok) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Shared spaces are not available on the current plan.' }, { status: 403 }),
      auth.cookieMutations
    );
  }

  try {
    const body = await request.json();
    const result = await revokeSpaceInvitation({
      userSupabase: auth.supabase,
      ownerUserId: auth.user.id,
      invitationId: typeof body?.invitationId === 'string' ? body.invitationId : '',
    });

    return applySupabaseCookies(
      NextResponse.json(result, { status: 200 }),
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
