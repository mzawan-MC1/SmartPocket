import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

type UserProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  is_active: boolean | null;
  preferred_language: string | null;
  default_currency: string | null;
  created_at: string | null;
};

type AdminUserRecord = {
  id: string;
  name: string;
  email: string;
  role: string;
  language: string | null;
  currency: string | null;
  is_active: boolean;
  email_verified: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
};

async function listAllAuthUsers() {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error('Supabase service role is not configured.');
  }

  const users: User[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    users.push(...data.users);

    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return { admin, users };
}

function buildDisplayName(user: User, profile?: UserProfileRow) {
  const profileName = profile?.full_name?.trim();
  if (profileName) return profileName;

  const metadataName =
    typeof user.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name.trim()
      : typeof user.user_metadata?.name === 'string'
        ? user.user_metadata.name.trim()
        : '';

  if (metadataName) return metadataName;

  return (user.email || profile?.email || 'Unknown user').split('@')[0];
}

export async function GET() {
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

  if (user.app_metadata?.role !== 'admin') {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      cookieMutations
    );
  }

  try {
    const { admin, users } = await listAllAuthUsers();
    const userIds = users.map((authUser) => authUser.id);

    let profiles: UserProfileRow[] = [];
    if (userIds.length > 0) {
      const { data: profileRows, error: profilesError } = await admin
        .from('user_profiles')
        .select('id, email, full_name, role, is_active, preferred_language, default_currency, created_at')
        .in('id', userIds);

      if (profilesError) {
        throw profilesError;
      }

      profiles = (profileRows || []) as UserProfileRow[];
    }

    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

    const mergedUsers: AdminUserRecord[] = users
      .map((authUser) => {
        const profile = profilesById.get(authUser.id);
        const authRole = typeof authUser.app_metadata?.role === 'string' ? authUser.app_metadata.role : null;
        const profileRole = typeof profile?.role === 'string' ? profile.role : null;

        return {
          id: authUser.id,
          name: buildDisplayName(authUser, profile),
          email: authUser.email || profile?.email || '',
          role: authRole || profileRole || 'user',
          language: profile?.preferred_language || null,
          currency: profile?.default_currency || null,
          is_active: profile?.is_active ?? true,
          email_verified: Boolean(authUser.email_confirmed_at),
          created_at: profile?.created_at || authUser.created_at || null,
          last_sign_in_at: authUser.last_sign_in_at || null,
        };
      })
      .sort((a, b) => {
        const first = a.created_at ? new Date(a.created_at).getTime() : 0;
        const second = b.created_at ? new Date(b.created_at).getTime() : 0;
        return second - first;
      });

    return applySupabaseCookies(
      NextResponse.json({ users: mergedUsers }, { status: 200 }),
      cookieMutations
    );
  } catch (routeError: any) {
    console.error('[api/admin/users] Failed to load users:', routeError?.message);
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to load users.' }, { status: 500 }),
      cookieMutations
    );
  }
}
