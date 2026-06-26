import type { ReactNode } from 'react';
import { enforceSubscriptionFeatureRoute } from '@/lib/subscription/server-gate';

export default async function ManagedPeopleLayout({
  children,
}: {
  children: ReactNode;
}) {
  await enforceSubscriptionFeatureRoute('managed_people');
  return <>{children}</>;
}
