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

function formatDate(dateStr: string, locale: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export default function RecentTransactions() {
  const { t } = useTranslation(['portal', 'common']);
  const { language } = useLanguage();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextTransactions = await getTransactions({ limit: 8 });
      setTransactions(nextTransactions);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

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
      className="h-full"
      action={
        <Link href="/transactions" className="text-sm font-700 text-accent hover:text-teal-600 flex items-center gap-1 transition-colors">
          {t('actions.viewAll', { ns: 'common' })} <ArrowRight size={13} />
        </Link>
      }
      bodyClassName="p-0"
    >

      {loading ? (
        <div className="divide-y divide-border">
          {[...Array(5)].map((_, i) => (
            <div key={`skel-txn-${i}`} className="flex items-center gap-3 px-4 py-3 animate-pulse">
              <div className="w-9 h-9 rounded-xl bg-muted flex-shrink-0" />
              <div className="flex-1">
                <div className="h-3 bg-muted rounded w-32 mb-1.5" />
                <div className="h-2.5 bg-muted rounded w-24" />
              </div>
              <div className="h-4 bg-muted rounded w-16" />
            </div>
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <div className="px-4 py-8">
          <EmptyState
            icon={Receipt}
            title={t('empty.noTransactions', { ns: 'common' })}
            description={t('recentTransactions.emptyDescription', { ns: 'portal' })}
          />
        </div>
      ) : (
        <div className="divide-y divide-border">
          {transactions.map((txn) => {
            const isIncome = txn.transaction_type === 'income';
            const catColor = txn.category?.color || '#6b7280';
            const hasReceipt = (txn.receipt_attachments?.length ?? 0) > 0;
            return (
              <div key={txn.id} className="group flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer hover:bg-muted/40">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: catColor + '20' }}
                >
                  {isIncome
                    ? <TrendingUp size={16} style={{ color: catColor }} />
                    : <TrendingDown size={16} style={{ color: catColor }} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-600 text-foreground truncate">
                      {txn.merchant || txn.description}
                    </p>
                    {hasReceipt && <Paperclip size={11} className="text-muted-foreground flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {txn.category?.name || t('recentTransactions.uncategorized', { ns: 'portal' })} · {txn.account?.name || ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <FormattedCurrencyAmount
                    amount={isIncome ? Math.abs(txn.amount) : -Math.abs(txn.amount)}
                    currencyCode={txn.currency}
                    size="sm"
                    className={`text-sm font-700 font-tabular ${isIncome ? 'text-positive' : 'text-foreground'}`}
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
      )}
    </SectionCard>
  );
}
