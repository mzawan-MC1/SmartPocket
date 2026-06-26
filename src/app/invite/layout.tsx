import type { ReactNode } from 'react';
import { enforceSubscriptionFeatureRoute } from '@/lib/subscription/server-gate';

export default async function SharedSpacesInviteLayout({
  children,
}: {
  children: ReactNode;
}) {
  await enforceSubscriptionFeatureRoute('shared_spaces');
  return <>{children}</>;
}
