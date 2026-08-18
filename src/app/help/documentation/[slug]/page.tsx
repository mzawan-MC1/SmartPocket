import { notFound } from 'next/navigation';
import type { SupportedLanguage } from '@/i18n/resources';
import { SUPPORTED_LANGUAGE_CODES } from '@/i18n/registry';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { resolveMetadataLanguage } from '@/lib/site-metadata';
import PublicDocumentationDetailClient from '@/components/documentation/PublicDocumentationDetailClient';
import {
  getPublicDocumentationDetail,
} from '@/lib/documentation-server';
import AppLayout from '@/components/AppLayout';

export const revalidate = 0;

export default async function DocumentationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const settings = await getPlatformSettingsSnapshot();
  const metadataLanguage = await resolveMetadataLanguage(settings);

  const detailResults = await Promise.all(
    SUPPORTED_LANGUAGE_CODES.map((language) => getPublicDocumentationDetail(slug, language))
  );

  const detailByLanguage = SUPPORTED_LANGUAGE_CODES.reduce(
    (accumulator, language, index) => {
      const detailData = detailResults[index];
      accumulator[language] = {
        article: detailData.article,
        effectiveLocale: detailData.effectiveLocale,
      };
      return accumulator;
    },
    {} as Record<
      SupportedLanguage,
      Awaited<ReturnType<typeof getPublicDocumentationDetail>>
    >
  );

  const resolved = detailByLanguage[metadataLanguage] || detailByLanguage.en;
  if (!resolved.article) {
    notFound();
  }

  return (
    <AppLayout activeRoute="/help">
      <div className="page-section page-shell-readable">
        <PublicDocumentationDetailClient
          dataByLanguage={detailByLanguage}
        />
      </div>
    </AppLayout>
  );
}
