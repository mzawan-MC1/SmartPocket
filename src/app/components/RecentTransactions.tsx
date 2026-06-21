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

function formatDate(dateStr: string, locale: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export default function RecentTransactions() {
  const { t } = useTranslation(['portal', 'common']);
  const { language } = useLanguage();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [documentSummaries, setDocumentSummaries] = useState<Record<string, TransactionListDocumentSummary>>({});
  const [detailsTransactionId, setDetailsTransactionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextTransactions = await getTransactions({ limit: 8 });
      const summaries = await getTransactionDocumentListSummaries(nextTransactions.map((txn) => txn.id));
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

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPocketDataChanged(['transactions', 'dashboard'], 'RecentTransactions', async () => {
    await load();
  });

  return (
    <SectionCard
      title={t('recentTransactions.title', { ns: 'portal' })}
      description={t('recentTransactions.description', { ns: 'portal' })}
      className="flex h-full flex-col rounded-[28px] border border-border/80 bg-card shadow-card-sm"
      action={
        <Link href="/transactions" className="inline-flex items-center gap-1 text-sm font-700 text-accent transition-colors hover:text-teal-600">
          {t('actions.viewAll', { ns: 'common' })} <ArrowRight size={13} />
        </Link>
      }
      bodyClassName="flex flex-1 flex-col p-0"
    >

      {loading ? (
        <div className="divide-y divide-border">
          {[...Array(5)].map((_, i) => (
            <div key={`skel-txn-${i}`} className="flex items-center gap-3 px-4 py-3 animate-pulse">
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
        <div className="flex flex-1 items-start justify-center px-4 pb-6 pt-3">
          <div className="flex max-w-[15rem] flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/55 text-muted-foreground">
              <Receipt size={22} />
            </div>
            <p className="text-sm font-700 text-foreground">{t('empty.noTransactions', { ns: 'common' })}</p>
            <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">{t('recentTransactions.emptyDescription', { ns: 'portal' })}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="divide-y divide-border">
          {transactions.slice(0, 5).map((txn) => {
            const isIncome = txn.transaction_type === 'income';
            const catColor = txn.category?.color || '#6b7280';
            const { hasDocument, itemCount, title } = getTransactionDocumentMeta(txn);
            return (
              <div key={txn.id} className="group flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer hover:bg-muted/35">
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: catColor + '20' }}
                >
                  {isIncome
                    ? <TrendingUp size={16} style={{ color: catColor }} />
                    : <TrendingDown size={16} style={{ color: catColor }} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-700 text-foreground truncate">
                      {title}
                    </p>
                    {hasDocument ? (
                      <button
                        type="button"
                        onClick={() => setDetailsTransactionId(txn.id)}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-600 text-muted-foreground"
                      >
                        <Paperclip size={11} className="text-muted-foreground flex-shrink-0" />
                        {itemCount > 0
                          ? t('transactions.documentReview.itemCountLabel', {
                              ns: 'portal',
                              count: itemCount,
                              defaultValue: '{{count}} items',
                            })
                          : t('transactions.documentDetails.documentSection', {
                              ns: 'portal',
                              defaultValue: 'Receipt / Document',
                            })}
                      </button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {txn.category?.name
                      ? translateSystemCategoryName(txn.category.name, (key, options) =>
                          t(key, { ...(options || {}), ns: 'common' })
                        )
                      : t('recentTransactions.uncategorized', { ns: 'portal' })} · {txn.account?.name || ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <FormattedCurrencyAmount
                    amount={isIncome ? Math.abs(txn.amount) : -Math.abs(txn.amount)}
                    currencyCode={txn.currency}
                    size="sm"
                    className={`text-sm font-700 font-tabular ${isIncome ? 'text-positive' : 'text-negative'}`}
                    showCode
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {formatDate(
                      txn.transaction_date,
                      language === 'ar' ? 'ar' : language === 'fr' ? 'fr' : language === 'ru' ? 'ru' : 'en-US'
                    )}
                  </span>
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
