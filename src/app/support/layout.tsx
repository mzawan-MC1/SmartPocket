import type { ReactNode } from 'react';
import { requireAuthenticatedPageUser } from '@/lib/support-server';

export default async function SupportLayout({ children }: { children: ReactNode }) {
  await requireAuthenticatedPageUser();
  return children;
}
