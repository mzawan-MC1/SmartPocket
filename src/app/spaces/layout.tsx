import type { ReactNode } from 'react';
import { enforceSharedSpacesWorkspaceRoute } from '@/lib/subscription/server-gate';

export default async function SharedSpacesLayout({
  children,
}: {
  children: ReactNode;
}) {
  await enforceSharedSpacesWorkspaceRoute();
  return <>{children}</>;
}
