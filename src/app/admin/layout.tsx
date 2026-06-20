import type { ReactNode } from 'react';
import AdminShell from '@/app/admin/components/AdminShell';
import AdminDocumentLanguage from '@/app/admin/components/AdminDocumentLanguage';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AdminDocumentLanguage />
      <AdminShell>{children}</AdminShell>
    </>
  );
}
