import 'server-only';

import { notFound } from 'next/navigation';
import { requireAdminPageUser } from '@/lib/support-server';
import { createAdminClient } from '@/lib/supabase/admin';
import AdminDocumentationForm from '@/app/admin/documentation/AdminDocumentationForm';
import { loadDocumentationTranslationStatus } from '@/lib/documentation-translate-server';
import type { DocumentationArticleRecord } from '@/lib/documentation';

export const revalidate = 0;

export default async function EditDocumentationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPageUser();
  const admin = createAdminClient();
  if (!admin) notFound();

  const { id } = await params;

  const { data, error } = await admin
    .from('documentation_articles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) notFound();

  let initialTranslationStatus = null;
  try {
    initialTranslationStatus = await loadDocumentationTranslationStatus(admin, id);
  } catch {
    initialTranslationStatus = null;
  }

  return (
    <AdminDocumentationForm
      mode="edit"
      initial={data as DocumentationArticleRecord}
      initialTranslationStatus={initialTranslationStatus}
    />
  );
}
