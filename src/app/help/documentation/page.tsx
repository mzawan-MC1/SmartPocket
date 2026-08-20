import type { SupportedLanguage } from '@/i18n/resources';
import { SUPPORTED_LANGUAGE_CODES } from '@/i18n/registry';
import PublicDocumentationClient from '@/components/documentation/PublicDocumentationClient';
import { getPublicDocumentationList } from '@/lib/documentation-server';
import PublicLayout from '@/app/(public)/layout';

export const revalidate = 0;

type DocPageLanguageData = Awaited<ReturnType<typeof getPublicDocumentationList>>;

export default async function DocumentationPage() {
  const docPageDataResults = await Promise.all(
    SUPPORTED_LANGUAGE_CODES.map((language) => getPublicDocumentationList(language))
  );

  const docDataByLanguage = SUPPORTED_LANGUAGE_CODES.reduce(
    (accumulator, language, index) => {
      const pageData = docPageDataResults[index];
      accumulator[language] = {
        articles: pageData.articles,
        effectiveLocale: pageData.effectiveLocale,
      };
      return accumulator;
    },
    {} as Record<
      SupportedLanguage,
      { articles: DocPageLanguageData['articles']; effectiveLocale: DocPageLanguageData['effectiveLocale'] }
    >
  );

  const supportHref = '/contact';

  return (
    <PublicLayout>
      <div className="page-section page-shell-readable pt-8 md:pt-10 lg:pt-12 pb-12 md:pb-16 lg:pb-20">
        <PublicDocumentationClient
          dataByLanguage={docDataByLanguage}
          supportHref={supportHref}
        />
      </div>
    </PublicLayout>
  );
}
