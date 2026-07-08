'use client';

import React from 'react';
import PrintableReportFooter from './PrintableReportFooter';
import PrintableReportHeader from './PrintableReportHeader';
import type { PrintableReportIdentity, ReportMetadataItem } from './full-report-types';

export default function PrintableReportLayout({
  title,
  subtitle,
  identity,
  metadata,
  generatedAtLabel,
  children,
}: {
  title: string;
  subtitle?: string | null;
  identity: PrintableReportIdentity;
  metadata: ReportMetadataItem[];
  generatedAtLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="report-document mx-auto max-w-[1120px] space-y-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0 print:pb-0">
      <PrintableReportHeader
        title={title}
        subtitle={subtitle}
        identity={identity}
        metadata={metadata}
      />
      <div className="space-y-6">
        {children}
      </div>
      <PrintableReportFooter generatedAtLabel={generatedAtLabel} />
    </div>
  );
}
