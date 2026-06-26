import type { ReactNode } from 'react';
import { enforceSubscriptionFeatureRoute } from '@/lib/subscription/server-gate';

export default async function AiHistoryLayout({
  children,
}: {
  children: ReactNode;
}) {
  await enforceSubscriptionFeatureRoute('ai_history');
  return <>{children}</>;
}
