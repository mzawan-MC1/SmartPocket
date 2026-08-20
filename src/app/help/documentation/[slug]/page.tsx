import { notFound } from 'next/navigation';
import type { SupportedLanguage } from '@/i18n/resources';
import { SUPPORTED_LANGUAGE_CODES } from '@/i18n/registry';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { resolveMetadataLanguage } from '@/lib/site-metadata';
import PublicDocumentationDetailClient from '@/components/documentation/PublicDocumentationDetailClient';
import type { DocumentationCategoryRecord } from '@/lib/documentation';
import {
  getPublicActiveDocumentationCategories,
  getPublicDocumentationDetail,
  getRelatedPublicDocumentationArticles,
} from '@/lib/documentation-server';
import PublicLayout from '@/app/(public)/layout';

export const revalidate = 0;

export default async function DocumentationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const settings = await getPlatformSettingsSnapshot();
  const metadataLanguage = await resolveMetadataLanguage(settings);

  const [activeCategoriesResult, ...detailResults] = await Promise.all([
    getPublicActiveDocumentationCategories(),
    ...SUPPORTED_LANGUAGE_CODES.map((language) => getPublicDocumentationDetail(slug, language)),
  ]);

  const activeCategories: DocumentationCategoryRecord[] = Array.isArray(activeCategoriesResult)
    ? activeCategoriesResult
    : [];

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

  const relatedResults = await Promise.all(
    SUPPORTED_LANGUAGE_CODES.map((language) =>
      getRelatedPublicDocumentationArticles(slug, resolved.article!.category, language, 4)
    )
  );
  const relatedByLanguage = SUPPORTED_LANGUAGE_CODES.reduce(
    (accumulator, language, index) => {
      accumulator[language] = relatedResults[index];
      return accumulator;
    },
    {} as Record<SupportedLanguage, Awaited<ReturnType<typeof getRelatedPublicDocumentationArticles>>>
  );

  return (
    <PublicLayout>
      <div className="page-section page-shell-readable pt-8 md:pt-10 lg:pt-12 pb-12 md:pb-16 lg:pb-20">
        <PublicDocumentationDetailClient
          dataByLanguage={detailByLanguage}
          relatedByLanguage={relatedByLanguage}
          activeCategories={activeCategories}
        />
      </div>
    </PublicLayout>
  );
}
