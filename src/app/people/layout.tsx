import type { ReactNode } from 'react';
import AppLayout from '@/components/AppLayout';
import SubscriptionFeatureGate from '@/components/subscription/SubscriptionFeatureGate';
import { enforceSubscriptionFeatureRoute } from '@/lib/subscription/server-gate';

export default async function ManagedPeopleLayout({
  children,
}: {
  children: ReactNode;
}) {
  const hasAccess = await enforceSubscriptionFeatureRoute('managed_people', {
    redirectOnDenied: false,
  });

  if (!hasAccess) {
    return (
      <AppLayout activeRoute="/people">
        <SubscriptionFeatureGate feature="managed_people">{null}</SubscriptionFeatureGate>
      </AppLayout>
    );
  }

  return <>{children}</>;
}
