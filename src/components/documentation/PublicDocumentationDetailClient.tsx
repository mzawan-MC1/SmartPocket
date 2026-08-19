'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen, LifeBuoy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import Badge from '@/components/ui/Badge';
import CmsHtml from '@/components/cms/CmsHtml';
import {
  documentationContentDir,
  isDocumentationContentRtl,
  normalizeDocumentationLanguage,
  type DocumentationLanguageCode,
  type PublicDocumentationArticle,
} from '@/lib/documentation';
import type { SupportedLanguage } from '@/i18n/resources';

export default function PublicDocumentationDetailClient({
  dataByLanguage,
}: {
  dataByLanguage: Record<
    SupportedLanguage,
    {
      article: PublicDocumentationArticle | null;
      effectiveLocale: DocumentationLanguageCode;
    }
  >;
}) {
  const { t } = useTranslation('portal');
  const router = useRouter();
  const { language, dir } = useLanguage();

  const activeLanguage = normalizeDocumentationLanguage(language);
  const resolvedData = dataByLanguage[activeLanguage] || dataByLanguage.en;
  const article = resolvedData.article;

  const contentLocale = resolvedData.effectiveLocale;
  const contentDir = documentationContentDir(contentLocale);
  const contentIsRtl = isDocumentationContentRtl(contentLocale);

  if (!article) {
    return null;
  }

  const displayCategoryLabel = (category: string) => {
    const key = `documentation.categories.${category.replace(/-/g, '')}`;
    const val = t(key, { ns: 'portal', defaultValue: '' });
    return val || category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, ' ');
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-6" dir={dir}>
      <nav className="flex items-center gap-2">
        <Link
          href="/help/documentation"
          className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-700 text-muted-foreground transition-colors hover:border-accent hover:text-accent"
        >
          <ArrowLeft size={14} />
          {t('documentation.backToList', { ns: 'portal', defaultValue: 'Back to Documentation' })}
        </Link>
      </nav>

      <article dir={contentDir} className="mx-auto max-w-4xl overflow-hidden rounded-[28px] border border-border bg-card shadow-card-sm">
        <header className="border-b border-border px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {article.category ? (
                  <Badge variant="active">{displayCategoryLabel(article.category)}</Badge>
                ) : null}
                {article.updatedAt ? (
                  <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11px] font-700 uppercase tracking-[0.12em] text-muted-foreground">
                    {t('documentation.updated', { ns: 'portal', defaultValue: 'Updated' })} {formatDate(article.updatedAt)}
                  </span>
                ) : null}
              </div>
              <h1 className={`mt-4 text-2xl font-800 text-foreground sm:text-3xl ${contentIsRtl ? 'text-right' : 'text-left'}`}>
                {article.title}
              </h1>
              <p className={`mt-3 text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7 ${contentIsRtl ? 'text-right' : 'text-left'}`}>
                {article.summary}
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent sm:h-14 sm:w-14">
              <BookOpen size={22} />
            </div>
          </div>
        </header>

        <div dir={contentDir} className={`px-5 py-7 sm:px-8 sm:py-10 ${contentIsRtl ? 'text-right' : 'text-left'}`}>
          <div className="mx-auto max-w-3xl">
            <CmsHtml
              html={article.contentHtml}
              className={`prose prose-slate max-w-none text-[0.95rem] leading-[1.75] text-muted-foreground [&_a]:text-accent [&_a]:no-underline hover:[&_a]:underline [&_h1]:text-foreground [&_h1]:text-2xl [&_h1]:font-800 [&_h2]:text-foreground [&_h2]:text-xl [&_h2]:font-800 [&_h3]:text-foreground [&_h3]:text-lg [&_h3]:font-800 [&_ol]:ps-6 [&_ul]:ps-6 [&_p]:text-foreground/85 [&_p]:my-4 [&_blockquote]:border-s-4 [&_blockquote]:border-accent/40 [&_blockquote]:bg-accent/5 [&_blockquote]:ps-4 [&_blockquote]:py-2 [&_blockquote]:text-foreground/80 [&_blockquote]:my-4 [&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-accent-foreground [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/30 [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-xs [&_hr]:my-6 [&_hr]:border-border ${contentIsRtl ? 'text-right' : 'text-left'}`}
            />
          </div>
        </div>
      </article>

      <section className="rounded-[28px] border border-border bg-card px-5 py-6 shadow-card-sm sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-700 text-foreground">
              {t('documentation.supportCtaTitle', { ns: 'portal', defaultValue: "Still need help?" })}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t('documentation.supportCtaDescription', { ns: 'portal', defaultValue: 'If this guide didn\'t answer your question, open a support ticket and our team will help you.' })}
            </p>
          </div>
          <Link href="/support/new" className="btn-primary inline-flex min-h-11 items-center justify-center gap-2">
            <LifeBuoy size={16} />
            {t('documentation.createTicketAction', { ns: 'portal', defaultValue: 'Create support ticket' })}
          </Link>
        </div>
      </section>
    </div>
  );
}
