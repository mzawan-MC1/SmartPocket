import 'server-only';

import { redirect } from 'next/navigation';
import { createServerComponentSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  requireAiHistoryAccess,
  requireManagedPeopleAccess,
  requireSharedSpacesAccess,
  requireStandardReportsAccess,
} from '@/lib/subscription/server';
import type { SubscriptionFeatureCode } from '@/lib/subscription/types';

type SubscriptionRouteGateOptions = {
  redirectOnDenied?: boolean;
  redirectPath?: string;
};

type FeatureAccessResolver = (userId: string) => Promise<{ ok: boolean }>;

const FEATURE_ACCESS_RESOLVERS: Record<
  Extract<
    SubscriptionFeatureCode,
    'ai_history' | 'managed_people' | 'shared_spaces' | 'standard_reports'
  >,
  FeatureAccessResolver
> = {
  ai_history: async (userId) => requireAiHistoryAccess(userId, { skipUsageCheck: true }),
  managed_people: async (userId) => requireManagedPeopleAccess(userId, { skipUsageCheck: true }),
  shared_spaces: async (userId) => requireSharedSpacesAccess(userId, { skipUsageCheck: true }),
  standard_reports: async (userId) => requireStandardReportsAccess(userId, { skipUsageCheck: true }),
};

function buildFeatureRedirect(feature: SubscriptionFeatureCode) {
  return `/settings/subscription?feature=${encodeURIComponent(feature)}`;
}

export async function enforceSubscriptionFeatureRoute(
  feature: Extract<
    SubscriptionFeatureCode,
    'ai_history' | 'managed_people' | 'shared_spaces' | 'standard_reports'
  >,
  options: SubscriptionRouteGateOptions = {}
) {
  const { redirectOnDenied = true, redirectPath } = options;
  const supabase = await createServerComponentSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-up-login');
  }

  const access = await FEATURE_ACCESS_RESOLVERS[feature](user.id);
  if (!access.ok) {
    if (redirectOnDenied) {
      redirect(redirectPath || buildFeatureRedirect(feature));
    }

    return false;
  }

  return true;
}

export async function enforceSharedSpacesWorkspaceRoute(options: SubscriptionRouteGateOptions = {}) {
  const { redirectOnDenied = true, redirectPath } = options;
  const supabase = await createServerComponentSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-up-login');
  }

  const access = await requireSharedSpacesAccess(user.id, { skipUsageCheck: true });
  if (access.ok) {
    return true;
  }

  const email = user.email?.trim().toLowerCase();
  const admin = createAdminClient();
  if (!admin || !email) {
    if (redirectOnDenied) {
      redirect(redirectPath || buildFeatureRedirect('shared_spaces'));
    }

    return false;
  }

  const [memberAccess, inviteAccessByUserId, inviteAccessByEmail] = await Promise.all([
    admin
      .from('space_members')
      .select('id', { head: true, count: 'exact' })
      .eq('user_id', user.id)
      .limit(1),
    admin
      .from('space_invitations')
      .select('id', { head: true, count: 'exact' })
      .eq('status', 'pending')
      .eq('invited_user_id', user.id)
      .limit(1),
    admin
      .from('space_invitations')
      .select('id', { head: true, count: 'exact' })
      .eq('status', 'pending')
      .ilike('email', email)
      .limit(1),
  ]);

  const hasInvitationOrMembership =
    (memberAccess.count || 0) > 0
    || (inviteAccessByUserId.count || 0) > 0
    || (inviteAccessByEmail.count || 0) > 0;

  if (!hasInvitationOrMembership) {
    if (redirectOnDenied) {
      redirect(redirectPath || buildFeatureRedirect('shared_spaces'));
    }

    return false;
  }

  return true;
}
