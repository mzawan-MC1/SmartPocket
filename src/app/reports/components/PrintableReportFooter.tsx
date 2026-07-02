'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';

export default function PrintableReportFooter({
  generatedAtLabel,
}: {
  generatedAtLabel: string;
}) {
  const { t } = useTranslation('portal');

  return (
    <footer className="report-footer mt-8 border-t border-border/80 pt-4 text-xs text-muted-foreground">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="font-700 text-foreground">Smart Pocket</p>
          <p>{t('reports.fullReport.footer.tagline', { defaultValue: 'Personal finance made simple' })}</p>
          <p>1smartpocket.com</p>
          <p>{t('reports.fullReport.footer.poweredBy', { defaultValue: 'Powered by MCS Consultancy' })}</p>
        </div>
        <div className="space-y-1 text-start sm:text-end">
          <p>
            {t('reports.generated', { defaultValue: 'Generated' })}: {generatedAtLabel}
          </p>
          <p className="report-page-counter">
            {t('reports.fullReport.footer.page', { defaultValue: 'Page' })}{' '}
            <span className="report-page-number" aria-hidden="true" />
          </p>
        </div>
      </div>
    </footer>
  );
}
