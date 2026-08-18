import 'server-only';

import { notFound } from 'next/navigation';
import { requireAdminPageUser } from '@/lib/support-server';
import { createAdminClient } from '@/lib/supabase/admin';
import AdminDocumentationClient from '@/app/admin/documentation/AdminDocumentationClient';
import { loadDocumentationTranslationStatus } from '@/lib/documentation-translate-server';
import type {
  DocumentationArticleRecord,
} from '@/lib/documentation';
import type { DocumentationTranslationStatusResponse } from '@/lib/documentation-translate-server';

export const revalidate = 0;

export default async function AdminDocumentationPage() {
  await requireAdminPageUser();
  const admin = createAdminClient();
  if (!admin) notFound();

  const { data, error } = await admin
    .from('documentation_articles')
    .select('*')
    .order('display_order', { ascending: true })
    .order('updated_at', { ascending: false });

  const articles: DocumentationArticleRecord[] = error || !data ? [] : data as any;

  const initialStatuses: Record<string, DocumentationTranslationStatusResponse> = {};
  for (const a of articles) {
    try {
      initialStatuses[a.id] = await loadDocumentationTranslationStatus(admin, a.id);
    } catch {
      /* swallow individual status load failures — client refetches */
    }
  }

  return (
    <AdminDocumentationClient
      initialArticles={articles}
      initialTranslationStatuses={initialStatuses}
    />
  );
}
