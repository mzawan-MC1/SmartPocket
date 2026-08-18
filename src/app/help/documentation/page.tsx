import type { SupportedLanguage } from '@/i18n/resources';
import { SUPPORTED_LANGUAGE_CODES } from '@/i18n/registry';
import PublicDocumentationClient from '@/components/documentation/PublicDocumentationClient';
import { getPublicDocumentationList } from '@/lib/documentation-server';
import { createServerComponentSupabaseClient } from '@/lib/supabase/server';
import AppLayout from '@/components/AppLayout';

export const revalidate = 0;

type DocPageLanguageData = Awaited<ReturnType<typeof getPublicDocumentationList>>;

export default async function DocumentationPage() {
  const [supabase, ...docPageDataResults] = await Promise.all([
    createServerComponentSupabaseClient(),
    ...SUPPORTED_LANGUAGE_CODES.map((language) => getPublicDocumentationList(language)),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const supportHref = user ? '/support/new' : '/contact';

  return (
    <AppLayout activeRoute="/help">
      <div className="page-section page-shell-readable">
        <PublicDocumentationClient
          dataByLanguage={docDataByLanguage}
          supportHref={supportHref}
        />
      </div>
    </AppLayout>
  );
}
