'use client';

import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';

type LegalPageKey = 'privacy' | 'terms';

type LegalSection = {
  title: string;
  content: string;
};

function readLegalSections(value: unknown): LegalSection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = item as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title.trim() : '';
      const content = typeof record.content === 'string' ? record.content.trim() : '';

      return {
        title,
        content,
      };
    })
    .filter((section) => section.title && section.content);
}

export default function PublicLegalPageClient({
  pageKey,
}: {
  pageKey: LegalPageKey;
}) {
  const { t } = useTranslation('public');
  const { dir } = useLanguage();
  const baseKey = `legal.${pageKey}`;
  const sections = readLegalSections(t(`${baseKey}.sections`, { returnObjects: true }));

  return (
    <div className="py-16 px-4" dir={dir}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-700 text-foreground mb-2">
          {t(`${baseKey}.title`)}
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          {t(`${baseKey}.lastUpdatedLabel`)} {t(`${baseKey}.lastUpdatedDate`)}
        </p>
        <div className="space-y-8 text-muted-foreground">
          {sections.map((section) => (
            <div key={section.title}>
              <h2 className="text-lg font-700 text-foreground mb-2">{section.title}</h2>
              <p className="leading-relaxed">{section.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
