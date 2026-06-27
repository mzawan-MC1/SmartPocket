import { NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { respondToSpaceInvitation, toInvitationErrorResponse } from '@/lib/spaces-invitations-server';

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

  try {
    const body = await request.json();
    const result = await respondToSpaceInvitation({
      userSupabase: auth.supabase,
      invitationId: typeof body?.invitationId === 'string' ? body.invitationId : null,
      token: typeof body?.token === 'string' ? body.token : null,
      response: body?.response === 'declined' ? 'declined' : 'accepted',
    });

    return applySupabaseCookies(
      NextResponse.json({
        success: true,
        ...result,
      }, { status: 200 }),
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
