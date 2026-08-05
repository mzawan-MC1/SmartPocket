import type { ReactNode } from 'react';
import AppLayout from '@/components/AppLayout';
import SubscriptionFeatureGate from '@/components/subscription/SubscriptionFeatureGate';
import { enforceSubscriptionFeatureRoute } from '@/lib/subscription/server-gate';

export default async function ReportsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const hasAccess = await enforceSubscriptionFeatureRoute('standard_reports', {
    redirectOnDenied: false,
  });

  if (!hasAccess) {
    return (
      <AppLayout activeRoute="/reports" hideMobileFooter>
        <SubscriptionFeatureGate feature="standard_reports">{null}</SubscriptionFeatureGate>
      </AppLayout>
    );
  }

  return <>{children}</>;
}
