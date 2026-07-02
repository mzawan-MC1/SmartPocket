'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';

export interface ReportTransactionRow {
  id: string;
  date: string;
  description: string;
  merchant: string | null;
  typeLabel: string;
  category: string | null;
  account: string | null;
  person: string | null;
  originalAmount: number;
  originalCurrency: string;
  reportingAmount: number | null;
  reportingCurrency: string;
  statusLabel: string;
  hasNotes: boolean;
  hasReceipt: boolean;
}

export default function ReportTransactionTable({
  rows,
}: {
  rows: ReportTransactionRow[];
}) {
  const { t } = useTranslation('portal');

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/15 p-4 text-sm text-muted-foreground">
        {t('reports.fullReport.transactions.empty', {
          defaultValue: 'No transactions match the selected report filters.',
        })}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border report-print-section">
      <table className="report-print-table min-w-full text-sm">
        <thead className="bg-muted/30">
          <tr className="border-b border-border">
            {[
              t('reports.fullReport.transactions.columns.date', { defaultValue: 'Date' }),
              t('reports.fullReport.transactions.columns.description', { defaultValue: 'Description' }),
              t('reports.fullReport.transactions.columns.merchant', { defaultValue: 'Merchant / source' }),
              t('reports.fullReport.transactions.columns.type', { defaultValue: 'Type' }),
              t('reports.fullReport.transactions.columns.category', { defaultValue: 'Category' }),
              t('reports.fullReport.transactions.columns.account', { defaultValue: 'Account' }),
              t('reports.fullReport.transactions.columns.person', { defaultValue: 'Person' }),
              t('reports.fullReport.transactions.columns.originalAmount', { defaultValue: 'Original amount' }),
              t('reports.fullReport.transactions.columns.originalCurrency', { defaultValue: 'Original currency' }),
              t('reports.fullReport.transactions.columns.reportingAmount', { defaultValue: 'Reporting amount' }),
              t('reports.fullReport.transactions.columns.status', { defaultValue: 'Payment / status' }),
              t('reports.fullReport.transactions.columns.notes', { defaultValue: 'Notes' }),
              t('reports.fullReport.transactions.columns.receipt', { defaultValue: 'Receipt' }),
            ].map((label) => (
              <th
                key={label}
                className="px-3 py-2 text-left text-[11px] font-700 uppercase tracking-wider text-muted-foreground"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border/80 align-top last:border-b-0">
              <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{row.date}</td>
              <td className="px-3 py-2.5 text-foreground">{row.description}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{row.merchant || '—'}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{row.typeLabel}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{row.category || '—'}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{row.account || '—'}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{row.person || '—'}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right">
                <FormattedCurrencyAmount
                  amount={row.originalAmount}
                  currencyCode={row.originalCurrency}
                  className={`font-700 ${row.originalAmount >= 0 ? 'text-positive' : 'text-foreground'}`}
                  showCode
                />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{row.originalCurrency}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-muted-foreground">
                {row.reportingAmount === null ? (
                  t('reports.unavailable', { defaultValue: 'Unavailable' })
                ) : (
                  <FormattedCurrencyAmount
                    amount={row.reportingAmount}
                    currencyCode={row.reportingCurrency}
                    className="font-600 text-foreground"
                    showCode
                  />
                )}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">{row.statusLabel}</td>
              <td className="px-3 py-2.5 text-center text-muted-foreground">
                {row.hasNotes
                  ? t('reports.fullReport.shared.yes', { defaultValue: 'Yes' })
                  : '—'}
              </td>
              <td className="px-3 py-2.5 text-center text-muted-foreground">
                {row.hasReceipt
                  ? t('reports.fullReport.shared.yes', { defaultValue: 'Yes' })
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
