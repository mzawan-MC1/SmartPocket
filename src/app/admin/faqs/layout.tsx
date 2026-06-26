import type { ReactNode } from 'react';
import { requireAdminPageUser } from '@/lib/support-server';

export default async function AdminFaqLayout({ children }: { children: ReactNode }) {
  await requireAdminPageUser();
  return children;
}
