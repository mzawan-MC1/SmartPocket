import type { ReactNode } from 'react';
import AppLayout from '@/components/AppLayout';
import SubscriptionFeatureGate from '@/components/subscription/SubscriptionFeatureGate';
import { enforceSubscriptionFeatureRoute } from '@/lib/subscription/server-gate';

export default async function AiHistoryLayout({
  children,
}: {
  children: ReactNode;
}) {
  const hasAccess = await enforceSubscriptionFeatureRoute('ai_history', {
    redirectOnDenied: false,
  });

  if (!hasAccess) {
    return (
      <AppLayout activeRoute="/ai-history">
        <SubscriptionFeatureGate feature="ai_history">{null}</SubscriptionFeatureGate>
      </AppLayout>
    );
  }

  return <>{children}</>;
}
