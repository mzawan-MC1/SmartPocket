import 'server-only';

import { redirect } from 'next/navigation';
import { createServerComponentSupabaseClient } from '@/lib/supabase/server';
import {
  requireAiHistoryAccess,
  requireManagedPeopleAccess,
  requireSharedSpacesAccess,
  requireStandardReportsAccess,
} from '@/lib/subscription/server';
import type { SubscriptionFeatureCode } from '@/lib/subscription/types';

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
  redirectPath?: string
) {
  const supabase = await createServerComponentSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-up-login');
  }

  const access = await FEATURE_ACCESS_RESOLVERS[feature](user.id);
  if (!access.ok) {
    redirect(redirectPath || buildFeatureRedirect(feature));
  }
}
