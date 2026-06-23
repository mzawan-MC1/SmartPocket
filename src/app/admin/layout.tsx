import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import AdminShell from '@/app/admin/components/AdminShell';
import AdminDocumentLanguage from '@/app/admin/components/AdminDocumentLanguage';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AdminDocumentLanguage />
      <AdminShell>{children}</AdminShell>
    </>
  );
}
