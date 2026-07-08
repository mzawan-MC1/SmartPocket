'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/lib/locale';

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
  const { language } = useLanguage();
  const locale = getIntlLocale(language);
  const isArabic = language === 'ar';

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
    <>
      <div className="space-y-3 sm:hidden">
        {rows.map((row) => {
          const formattedDate = new Intl.DateTimeFormat(locale, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(new Date(`${row.date}T12:00:00Z`));

          return (
            <div key={`mobile-${row.id}`} className="rounded-[24px] border border-border bg-card p-3.5 shadow-card-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border bg-muted/20 px-2.5 py-1 text-[11px] font-700 text-muted-foreground">
                      {row.typeLabel}
                    </span>
                    <span className="text-[11px] font-600 text-muted-foreground">{formattedDate}</span>
                  </div>
                  <p className={`mt-2 text-foreground ${isArabic ? 'text-[15px] leading-6 font-700' : 'text-sm font-700'}`}>{row.description}</p>
                  {row.merchant ? (
                    <p className={`mt-1 text-muted-foreground ${isArabic ? 'text-[12px] leading-5' : 'text-xs'}`}>{row.merchant}</p>
                  ) : null}
                </div>
                <FormattedCurrencyAmount
                  amount={row.originalAmount}
                  currencyCode={row.originalCurrency}
                  className={`text-sm font-700 ${row.originalAmount >= 0 ? 'text-positive' : 'text-foreground'}`}
                  showCode
                />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 min-[390px]:grid-cols-2">
                <div>
                  <p className={`text-muted-foreground ${isArabic ? 'text-[11px] tracking-normal' : 'text-[10px] uppercase tracking-wider'}`}>{t('reports.fullReport.transactions.columns.category', { defaultValue: 'Category' })}</p>
                  <p className={`text-foreground ${isArabic ? 'text-[13px] leading-5' : ''}`}>{row.category || '—'}</p>
                </div>
                <div>
                  <p className={`text-muted-foreground ${isArabic ? 'text-[11px] tracking-normal' : 'text-[10px] uppercase tracking-wider'}`}>{t('reports.fullReport.transactions.columns.account', { defaultValue: 'Account' })}</p>
                  <p className={`text-foreground ${isArabic ? 'text-[13px] leading-5' : ''}`}>{row.account || '—'}</p>
                </div>
                <div>
                  <p className={`text-muted-foreground ${isArabic ? 'text-[11px] tracking-normal' : 'text-[10px] uppercase tracking-wider'}`}>{t('reports.fullReport.transactions.columns.status', { defaultValue: 'Payment / status' })}</p>
                  <p className={`text-foreground ${isArabic ? 'text-[13px] leading-5' : ''}`}>{row.statusLabel}</p>
                </div>
                <div>
                  <p className={`text-muted-foreground ${isArabic ? 'text-[11px] tracking-normal' : 'text-[10px] uppercase tracking-wider'}`}>{t('reports.fullReport.transactions.columns.reportingAmount', { defaultValue: 'Reporting amount' })}</p>
                  {row.reportingAmount === null ? (
                    <span className="text-warning">{t('reports.unavailable', { defaultValue: 'Unavailable' })}</span>
                  ) : (
                    <FormattedCurrencyAmount
                      amount={row.reportingAmount}
                      currencyCode={row.reportingCurrency}
                      className="font-600 text-foreground"
                      showCode
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto rounded-2xl border border-border report-print-section sm:block">
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
    </>
  );
}
