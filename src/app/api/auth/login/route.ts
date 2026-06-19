import { NextRequest, NextResponse } from 'next/server';
import { getPostAuthDestination, getSafeNextPath } from '@/lib/auth/redirects';
import {
  applySupabaseCookies,
  createRouteHandlerSupabaseClient,
} from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

    if (!authData.user.email_confirmed_at) {
      await supabase.auth.signOut();
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'Please verify your email before signing in.' },
          { status: 403 }
        ),
        cookieMutations
      );
    }

    const userId = authData.user.id;
    const safeNext = getSafeNextPath(next ?? null);
    const { destination, profileError } = await getPostAuthDestination(supabase, userId, safeNext);

    if (profileError) {
      console.error('[api/auth/login] profile lookup failed:', profileError);
    }

    try {
      const admin = createAdminClient();
      if (admin) {
        const sourceKey = `security_login:${userId}:${new Date().toISOString().slice(0, 10)}`;
        const { data: preferences } = await admin
          .from('notification_preferences')
          .select('in_app_enabled, account_security_notifications')
          .eq('user_id', userId)
          .maybeSingle();

        if (!preferences || (preferences.in_app_enabled && preferences.account_security_notifications)) {
          const { data: existing } = await admin
            .from('notifications')
            .select('id')
            .eq('user_id', userId)
            .eq('source_key', sourceKey)
            .maybeSingle();

          if (!existing) {
            await admin
              .from('notifications')
              .insert({
                user_id: userId,
                type: 'account_security',
                title: 'Successful sign-in',
                message: 'Your account was accessed successfully.',
                action_url: '/settings',
                metadata: {
                  event: 'login',
                },
                source_key: sourceKey,
              });
          }
        }
      }
    } catch (notificationError: any) {
      console.error('[api/auth/login] notification write skipped:', notificationError?.message);
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
