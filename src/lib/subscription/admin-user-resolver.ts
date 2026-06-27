import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export type AdminUserIdentifierErrorCode =
  | 'invalid_user_identifier'
  | 'user_not_found'
  | 'ambiguous_user'
  | 'invalid_uuid'
  | 'invalid_email';

export type ResolvedUser = {
  userId: string;
  email: string | null;
  displayName: string | null;
};

type AuthUserShape = {
  id: string;
  email?: string | null;
  user_metadata?: {
    full_name?: string | null;
    name?: string | null;
  } | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const UUIDISH_PATTERN = /^[0-9a-f-]+$/i;

export class AdminUserIdentifierError extends Error {
  code: AdminUserIdentifierErrorCode;

  constructor(code: AdminUserIdentifierErrorCode, message: string) {
    super(message);
    this.name = 'AdminUserIdentifierError';
    this.code = code;
  }
}

function getAdminClientOrThrow() {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error('Supabase service role is not configured.');
  }
  return admin;
}

function normalizeIdentifier(identifier: string) {
  return identifier.trim();
}

function getDisplayName(args: {
  authUser: AuthUserShape | null;
  profile: { full_name?: string | null } | null;
}) {
  const profileName = typeof args.profile?.full_name === 'string' ? args.profile.full_name.trim() : '';
  if (profileName) {
    return profileName;
  }

  const metadataFullName = typeof args.authUser?.user_metadata?.full_name === 'string'
    ? args.authUser.user_metadata.full_name.trim()
    : '';
  if (metadataFullName) {
    return metadataFullName;
  }

  const metadataName = typeof args.authUser?.user_metadata?.name === 'string'
    ? args.authUser.user_metadata.name.trim()
    : '';
  if (metadataName) {
    return metadataName;
  }

  return null;
}

async function loadProfile(admin: AdminClient, userId: string) {
  const { data, error } = await admin
    .from('user_profiles')
    .select('id,email,full_name')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function resolveUserByUuid(admin: AdminClient, userId: string): Promise<ResolvedUser> {
  const authResult = await admin.auth.admin.getUserById(userId);
  const authUser = authResult.data.user as AuthUserShape | undefined;

  if (authResult.error || !authUser) {
    throw new AdminUserIdentifierError(
      'user_not_found',
      'No user was found with this email or UUID.'
    );
  }

  const profile = await loadProfile(admin, authUser.id);
  const email = typeof authUser.email === 'string' && authUser.email.trim()
    ? authUser.email.trim()
    : (typeof profile?.email === 'string' && profile.email.trim() ? profile.email.trim() : null);

  return {
    userId: authUser.id,
    email,
    displayName: getDisplayName({ authUser, profile }),
  };
}

async function findAuthUsersByEmail(admin: AdminClient, normalizedEmail: string): Promise<AuthUserShape[]> {
  const matches: AuthUserShape[] = [];
  const perPage = 200;

  for (let page = 1; page <= 100; page += 1) {
    const authResult = await admin.auth.admin.listUsers({ page, perPage });
    if (authResult.error) {
      throw authResult.error;
    }

    const users = (authResult.data.users ?? []) as AuthUserShape[];
    for (const user of users) {
      const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
      if (email === normalizedEmail) {
        matches.push(user);
        if (matches.length > 1) {
          return matches;
        }
      }
    }

    if (users.length < perPage) {
      break;
    }
  }

  return matches;
}

async function resolveUserByEmail(admin: AdminClient, email: string): Promise<ResolvedUser> {
  const normalizedEmail = email.trim().toLowerCase();
  const authMatches = await findAuthUsersByEmail(admin, normalizedEmail);

  if (authMatches.length === 0) {
    throw new AdminUserIdentifierError(
      'user_not_found',
      'No user was found with this email or UUID.'
    );
  }

  if (authMatches.length > 1) {
    throw new AdminUserIdentifierError(
      'ambiguous_user',
      'More than one matching user was found. Contact an administrator.'
    );
  }

  const authUser = authMatches[0];
  const profile = await loadProfile(admin, authUser.id);

  return {
    userId: authUser.id,
    email: typeof authUser.email === 'string' && authUser.email.trim() ? authUser.email.trim() : null,
    displayName: getDisplayName({ authUser, profile }),
  };
}

export async function resolveUserIdentifier(
  identifier: string,
  options?: { admin?: AdminClient }
): Promise<ResolvedUser> {
  const normalized = normalizeIdentifier(identifier);
  const admin = options?.admin ?? getAdminClientOrThrow();

  if (!normalized) {
    throw new AdminUserIdentifierError(
      'invalid_user_identifier',
      'Enter a valid email address or user UUID.'
    );
  }

  if (UUID_PATTERN.test(normalized)) {
    return resolveUserByUuid(admin, normalized);
  }

  if (normalized.includes('@')) {
    if (!EMAIL_PATTERN.test(normalized)) {
      throw new AdminUserIdentifierError(
        'invalid_email',
        'Enter a valid email address or user UUID.'
      );
    }
    return resolveUserByEmail(admin, normalized);
  }

  if (UUIDISH_PATTERN.test(normalized) || normalized.includes('-')) {
    throw new AdminUserIdentifierError(
      'invalid_uuid',
      'Enter a valid email address or user UUID.'
    );
  }

  throw new AdminUserIdentifierError(
    'invalid_user_identifier',
    'Enter a valid email address or user UUID.'
  );
}
