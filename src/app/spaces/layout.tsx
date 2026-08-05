import type { ReactNode } from 'react';
import AppLayout from '@/components/AppLayout';
import SubscriptionFeatureGate from '@/components/subscription/SubscriptionFeatureGate';
import { enforceSharedSpacesWorkspaceRoute } from '@/lib/subscription/server-gate';

export default async function SharedSpacesLayout({
  children,
}: {
  children: ReactNode;
}) {
  const hasAccess = await enforceSharedSpacesWorkspaceRoute({
    redirectOnDenied: false,
  });

  if (!hasAccess) {
    return (
      <AppLayout activeRoute="/spaces">
        <SubscriptionFeatureGate feature="shared_spaces">{null}</SubscriptionFeatureGate>
      </AppLayout>
    );
  }

  return <>{children}</>;
}
