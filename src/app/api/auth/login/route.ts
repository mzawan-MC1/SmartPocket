import { NextRequest, NextResponse } from 'next/server';
import { getPostAuthDestination, getSafeNextPath } from '@/lib/auth/redirects';
import {
  applySupabaseCookies,
  createRouteHandlerSupabaseClient,
} from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, next } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message ?? 'Invalid email or password.' },
        { status: 401 }
      );
    }

    const userId = authData.user.id;
    const safeNext = getSafeNextPath(next ?? null);
    const { destination, profileError } = await getPostAuthDestination(supabase, userId, safeNext);

    if (profileError) {
      console.error('[api/auth/login] profile lookup failed:', profileError);
    }

    const response = NextResponse.json(
      { destination, userId },
      {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }
    );

    return applySupabaseCookies(response, cookieMutations);
  } catch (err: any) {
    console.error('[api/auth/login] Unexpected error:', err?.message);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
