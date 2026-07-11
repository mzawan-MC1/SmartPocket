'use client';

import React from 'react';
import PrintableReportLayout from './PrintableReportLayout';
import type { PrintableReportIdentity, ReportMetadataItem } from './full-report-types';

export interface PrintableStandardReportMetric {
  label: string;
  value: string;
  helper?: string | null;
  tone?: 'positive' | 'negative' | 'neutral';
}

export interface PrintableStandardReportSection {
  title: string;
  description?: string | null;
  content: React.ReactNode;
}

export function PrintableDocumentTable({
  headers,
  rows,
  emptyMessage,
  compact = false,
}: {
  headers: string[];
  rows: string[][];
  emptyMessage: string;
  compact?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/15 p-4 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {rows.map((row, rowIndex) => (
          <div key={`print-row-${rowIndex}`} className="rounded-[22px] border border-border bg-card p-3.5 shadow-card-sm">
            <div className="space-y-3">
              {row.map((cell, cellIndex) => (
                <div key={`print-row-${rowIndex}-cell-${cellIndex}`} className={cellIndex === 0 ? '' : 'border-t border-border/70 pt-3'}>
                  <p className="text-[10px] font-700 uppercase tracking-[0.16em] text-muted-foreground">
                    {headers[cellIndex] || '—'}
                  </p>
                  <p className={`mt-1 whitespace-pre-wrap break-words text-foreground ${compact ? 'text-xs' : 'text-sm'}`}>
                    {cell || '—'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-2xl border border-border md:block">
        <table className={`min-w-full ${compact ? 'text-xs' : 'text-sm'}`}>
          <thead className="bg-muted/25">
            <tr className="border-b border-border">
              {headers.map((header) => (
                <th
                  key={header}
                  className="px-3 py-2 text-left text-[10px] font-700 uppercase tracking-[0.16em] text-muted-foreground"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`print-table-row-${rowIndex}`} className="border-b border-border/70 align-top last:border-b-0">
                {row.map((cell, cellIndex) => (
                  <td key={`print-table-row-${rowIndex}-cell-${cellIndex}`} className="px-3 py-2.5 whitespace-pre-wrap break-words text-foreground">
                    {cell || '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function PrintableStandardReport({
  title,
  subtitle,
  identity,
  metadata,
  generatedAtLabel,
  summaryTitle = 'Summary',
  summaryDescription = 'Key metrics and selected filters for the generated report.',
  summary,
  chartTitle,
  chartDescription,
  chart,
  sections,
}: {
  title: string;
  subtitle?: string | null;
  identity: PrintableReportIdentity;
  metadata: ReportMetadataItem[];
  generatedAtLabel: string;
  summaryTitle?: string;
  summaryDescription?: string | null;
  summary: PrintableStandardReportMetric[];
  chartTitle?: string | null;
  chartDescription?: string | null;
  chart?: React.ReactNode;
  sections?: PrintableStandardReportSection[];
}) {
  return (
    <PrintableReportLayout
      title={title}
      subtitle={subtitle}
      identity={identity}
      metadata={metadata}
      generatedAtLabel={generatedAtLabel}
    >
      <section className="rounded-[28px] border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-4">
          <h2 className="text-xl font-800 text-foreground">{summaryTitle}</h2>
          {summaryDescription ? <p className="mt-1 text-sm text-muted-foreground">{summaryDescription}</p> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summary.map((item) => (
            <div key={`${item.label}-${item.value}`} className="rounded-2xl border border-border/80 bg-muted/15 p-4">
              <p className="text-[10px] font-700 uppercase tracking-[0.16em] text-muted-foreground">
                {item.label}
              </p>
              <p
                className={`mt-2 text-lg font-800 break-words ${
                  item.tone === 'positive'
                    ? 'text-positive'
                    : item.tone === 'negative'
                      ? 'text-negative'
                      : 'text-foreground'
                }`}
              >
                {item.value}
              </p>
              {item.helper ? <p className="mt-1 text-xs text-muted-foreground">{item.helper}</p> : null}
            </div>
          ))}
        </div>
      </section>

      {chart ? (
        <section className="rounded-[28px] border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-4">
            <h2 className="text-xl font-800 text-foreground">{chartTitle || summaryTitle}</h2>
            {chartDescription ? <p className="mt-1 text-sm text-muted-foreground">{chartDescription}</p> : null}
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            {chart}
          </div>
        </section>
      ) : null}

      {(sections || []).map((section) => (
        <section key={section.title} className="rounded-[28px] border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-4">
            <h2 className="text-xl font-800 text-foreground">{section.title}</h2>
            {section.description ? <p className="mt-1 text-sm text-muted-foreground">{section.description}</p> : null}
          </div>
          {section.content}
        </section>
      ))}
    </PrintableReportLayout>
  );
}
