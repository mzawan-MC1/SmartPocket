import { NextRequest, NextResponse } from 'next/server';
import {
  applySupabaseCookies,
  createRouteHandlerSupabaseClient,
} from '@/lib/supabase/server';

type DesktopSessionBody = {
  access_token?: unknown;
  refresh_token?: unknown;
};

function isSafeTokenValue(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 4096;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as DesktopSessionBody;
    const accessToken = body.access_token;
    const refreshToken = body.refresh_token;

    if (!isSafeTokenValue(accessToken) || !isSafeTokenValue(refreshToken)) {
      return NextResponse.json(
        { success: false, error: 'Desktop session tokens are required.' },
        { status: 400 },
      );
    }

    const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (sessionError || !sessionData.session?.user) {
      return applySupabaseCookies(
        NextResponse.json(
          { success: false, error: sessionError?.message || 'Desktop session could not be established.' },
          { status: 401 },
        ),
        cookieMutations,
      );
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return applySupabaseCookies(
        NextResponse.json(
          { success: false, error: userError?.message || 'Desktop session user could not be verified.' },
          { status: 401 },
        ),
        cookieMutations,
      );
    }

    return applySupabaseCookies(
      NextResponse.json({ success: true, userId: userData.user.id }),
      cookieMutations,
    );
  } catch {
    return NextResponse.json(
      { success: false, error: 'Desktop session synchronization failed.' },
      { status: 500 },
    );
  }
}
