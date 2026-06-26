import type { ReactNode } from 'react';
import { enforceSubscriptionFeatureRoute } from '@/lib/subscription/server-gate';

export default async function ReportsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await enforceSubscriptionFeatureRoute('standard_reports');
  return <>{children}</>;
}
