'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown, Paperclip, ArrowRight, Receipt } from 'lucide-react';
import { getTransactions, type Transaction } from '@/lib/finance';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import EmptyState from '@/components/ui/EmptyState';
import SectionCard from '@/components/ui/SectionCard';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useLanguage } from '@/contexts/LanguageContext';
import { translateSystemCategoryName } from '@/lib/system-category-display';
import TransactionDetailsModal from '@/components/transactions/TransactionDetailsModal';
import {
  getTransactionDocumentListSummaries,
  type TransactionListDocumentSummary,
} from '@/lib/transaction-document-details';
import { getTransactionDocumentDisplayTitle } from '@/lib/transaction-documents';

const RECENT_TRANSACTIONS_LIMIT = 5;

function formatDate(dateStr: string, locale: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

function shouldOpenRowFromKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
  return event.key === 'Enter' || event.key === ' ';
}

export default function RecentTransactions({
  variant = 'default',
}: {
  variant?: 'default' | 'mobile-dashboard';
}) {
  const { t } = useTranslation(['portal', 'common']);
  const { language } = useLanguage();
  const isArabic = language === 'ar';
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [documentSummaries, setDocumentSummaries] = useState<Record<string, TransactionListDocumentSummary>>({});
  const [detailsTransactionId, setDetailsTransactionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextTransactions = await getTransactions({ limit: RECENT_TRANSACTIONS_LIMIT });
      const summaries = nextTransactions.length > 0
        ? await getTransactionDocumentListSummaries(nextTransactions.map((txn) => txn.id))
        : {};
      setTransactions(nextTransactions);
      setDocumentSummaries(summaries);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  const getTransactionDocumentMeta = useCallback((txn: Transaction) => {
    const documentSummary = documentSummaries[txn.id];
    const hasDocument = (txn.receipt_attachments?.length ?? 0) > 0 || !!documentSummary?.documentId;
    const itemCount = documentSummary?.itemCount || 0;
    const title = getTransactionDocumentDisplayTitle({
      merchant: txn.merchant,
      description: txn.description,
      hasDocument,
      fallbackLabel: t('transactions.documentDetails.fallbackTitle', {
        ns: 'portal',
        defaultValue: 'Receipt purchase',
      }),
    });

    return {
      hasDocument,
      itemCount,
      title,
    };
  }, [documentSummaries, t]);

  const openTransactionDetails = useCallback((transactionId: string) => {
    setDetailsTransactionId(transactionId);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPocketDataChanged(['transactions', 'transaction_documents', 'financial_accounts'], 'RecentTransactions', async () => {
    await load();
  });

  const visibleTransactions = variant === 'mobile-dashboard'
    ? transactions.slice(0, 4)
    : transactions;

  return (
    <SectionCard
      title={variant === 'mobile-dashboard' ? t('recentTransactions.mobileTitle', { ns: 'portal' }) : t('recentTransactions.title', { ns: 'portal' })}
      description={variant === 'mobile-dashboard' ? undefined : t('recentTransactions.description', { ns: 'portal' })}
      className={`flex h-full flex-col rounded-[28px] border shadow-card-sm transition-shadow duration-200 hover:shadow-card-md ${
        variant === 'mobile-dashboard'
          ? 'border-slate-200/80 bg-[linear-gradient(180deg,#ffffff,#f8fafc)]'
          : 'border-border/80 bg-card'
      }`}
      action={
        <Link href="/transactions" className={`font-700 ${variant === 'mobile-dashboard' ? 'text-[13px] text-[#2563eb]' : 'link-accent text-sm'}`}>
          {t('actions.viewAll', { ns: 'common' })}{variant === 'mobile-dashboard' ? null : <ArrowRight size={13} />}
        </Link>
      }
      bodyClassName={`flex flex-1 flex-col ${variant === 'mobile-dashboard' ? 'p-3 pt-2' : 'p-3'}`}
    >

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={`skel-txn-${i}`} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/15 px-3.5 py-3 animate-pulse">
              <div className="h-10 w-10 rounded-2xl bg-muted flex-shrink-0" />
              <div className="flex-1">
                <div className="h-3 bg-muted rounded w-32 mb-1.5" />
                <div className="h-2.5 bg-muted rounded w-24" />
              </div>
              <div className="h-4 bg-muted rounded w-16" />
            </div>
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t('empty.noTransactions', { ns: 'common' })}
          description={t('recentTransactions.emptyDescription', { ns: 'portal' })}
          variant="compact"
          tone="neutral"
          className="flex flex-1 items-center justify-center px-4 py-6"
        />
      ) : (
        <div className="flex flex-1 flex-col">
          <div className={variant === 'mobile-dashboard' ? 'divide-y divide-slate-200/70' : 'space-y-2'}>
          {visibleTransactions.map((txn) => {
            const isIncome = txn.transaction_type === 'income';
            const catColor = txn.category?.color || '#6b7280';
            const { hasDocument, itemCount, title } = getTransactionDocumentMeta(txn);
            const categoryLabel = txn.category?.name
              ? translateSystemCategoryName(txn.category.name, (key, options) =>
                  t(key, { ...(options || {}), ns: 'common' })
                )
              : t('recentTransactions.uncategorized', { ns: 'portal' });
            const accountLabel = txn.account?.name || '';
            const formattedDate = formatDate(
              txn.transaction_date,
              language === 'ar' ? 'ar' : language === 'fr' ? 'fr' : language === 'ru' ? 'ru' : 'en-US'
            );
            const ariaLabel = t('recentTransactions.openTransactionDetails', {
              ns: 'portal',
              defaultValue: 'Open transaction details for {{title}} on {{date}}',
              title,
              date: formattedDate,
            });
            return (
              <div
                key={txn.id}
                role="button"
                tabIndex={0}
                aria-label={ariaLabel}
                onClick={() => openTransactionDetails(txn.id)}
                onKeyDown={(event) => {
                  if (!shouldOpenRowFromKeyboard(event)) return;
                  event.preventDefault();
                  openTransactionDetails(txn.id);
                }}
                className={`group flex items-start gap-3 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 ${
                  variant === 'mobile-dashboard'
                    ? 'border-0 bg-transparent px-2 py-3 hover:bg-slate-50'
                    : 'rounded-2xl border border-transparent bg-muted/15 px-3.5 py-3 hover:border-border/70 hover:bg-muted/30'
                }`}
              >
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: catColor + '20' }}
                >
                  {isIncome
                    ? <TrendingUp size={16} style={{ color: catColor }} />
                    : <TrendingDown size={16} style={{ color: catColor }} />
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="min-w-0 flex-1 truncate text-sm font-700 text-foreground">
                      {title}
                    </p>
                    {hasDocument ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openTransactionDetails(txn.id);
                        }}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                        }}
                        className={`inline-flex max-w-full flex-shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-600 text-muted-foreground transition-colors hover:bg-muted/80 ${isArabic ? 'text-[11.5px] leading-5' : 'text-[11px] leading-4'}`}
                      >
                        <Paperclip size={11} className="text-muted-foreground flex-shrink-0" />
                        <span className="whitespace-nowrap font-tabular">
                          {itemCount > 0 ? itemCount : ''}
                        </span>
                      </button>
                    ) : null}
                  </div>
                  <p className={`mt-0.5 truncate text-muted-foreground ${isArabic ? 'text-[12.5px] leading-5' : 'text-xs'}`}>
                    {variant === 'mobile-dashboard' ? categoryLabel : `${categoryLabel} · ${accountLabel}`}
                  </p>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1 text-right">
                  <FormattedCurrencyAmount
                    amount={isIncome ? Math.abs(txn.amount) : -Math.abs(txn.amount)}
                    currencyCode={txn.currency}
                    size={variant === 'mobile-dashboard' ? 'sm' : 'sm'}
                    textOnly={variant === 'mobile-dashboard'}
                    className={`font-700 font-tabular ${variant === 'mobile-dashboard' ? 'text-[13px]' : 'text-sm'} ${isIncome ? 'text-positive' : variant === 'mobile-dashboard' ? 'text-foreground' : 'text-negative'}`}
                    showCode
                  />
                  {variant === 'mobile-dashboard' ? null : (
                    <span className={`text-muted-foreground ${isArabic ? 'text-[12px] leading-5' : 'text-[11px]'}`}>
                      {formattedDate}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}
      <TransactionDetailsModal
        isOpen={!!detailsTransactionId}
        transactionId={detailsTransactionId}
        onClose={() => setDetailsTransactionId(null)}
      />
    </SectionCard>
  );
}
