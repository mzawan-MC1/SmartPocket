import 'server-only';

import { notFound } from 'next/navigation';
import { requireAdminPageUser } from '@/lib/support-server';
import { createAdminClient } from '@/lib/supabase/admin';
import AdminDocumentationForm from '@/app/admin/documentation/AdminDocumentationForm';

export const revalidate = 0;

export default async function NewDocumentationPage() {
  await requireAdminPageUser();
  const admin = createAdminClient();
  if (!admin) notFound();

  return <AdminDocumentationForm mode="create" />;
}
