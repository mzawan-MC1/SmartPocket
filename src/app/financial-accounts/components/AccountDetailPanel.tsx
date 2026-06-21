'use client';
import React, { useEffect, useState } from 'react';
import { X, TrendingDown, TrendingUp, ArrowUpDown, Receipt } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getTransactions, type Transaction, type FinancialAccount } from '@/lib/finance';
import EmptyState from '@/components/ui/EmptyState';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { translateSystemCategoryName } from '@/lib/system-category-display';

interface AccountDetailPanelProps {
  account: FinancialAccount;
  onClose: () => void;
}

export default function AccountDetailPanel({ account, onClose }: AccountDetailPanelProps) {
  const { t } = useTranslation(['portal', 'common']);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTransactions({ accountId: account.id, limit: 20 })
      .then(setTransactions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [account.id]);

  const gradient = account.account_type === 'credit_card' ?'from-negative to-red-700'
    : account.account_type === 'savings' ?'from-positive to-teal-600'
    : account.account_type === 'cash' ?'from-warning to-amber-600' :'from-primary to-navy-600';

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card h-full shadow-card-lg border-l border-border flex flex-col slide-up overflow-hidden">
        {/* Header */}
        <div className={`bg-gradient-to-r ${gradient} p-6`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white/70 text-xs font-500 uppercase tracking-wider capitalize">
                {account.account_type.replace('_', ' ')}
              </p>
              <h2 className="text-white font-700 text-lg mt-0.5">{account.name}</h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              aria-label={t('actions.close', { ns: 'common' })}
            >
              <X size={16} className="text-white" />
            </button>
          </div>
          <div>
            <p className="text-white/60 text-xs">{t('accounts.currentBalance', { ns: 'portal' })}</p>
            <p className={`text-3xl font-800 font-tabular mt-0.5 ${account.current_balance < 0 ? 'text-red-200' : 'text-white'}`}>
              <FormattedCurrencyAmount
                amount={account.current_balance}
                currencyCode={account.currency}
                className={account.current_balance < 0 ? 'text-red-200' : 'text-white'}
              />
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 p-4 border-b border-border">
          <div className="bg-muted/40 rounded-xl p-3">
            <p className="text-xs text-muted-foreground mb-1">{t('accounts.openingBalance', { ns: 'portal' })}</p>
            <FormattedCurrencyAmount
              amount={account.opening_balance}
              currencyCode={account.currency}
              className="text-sm font-700 text-foreground"
            />
          </div>
          <div className="bg-muted/40 rounded-xl p-3">
            <p className="text-xs text-muted-foreground mb-1">{t('reports.summary.netChange', { ns: 'portal' })}</p>
            <FormattedCurrencyAmount
              amount={account.current_balance - account.opening_balance}
              currencyCode={account.currency}
              className={`text-sm font-700 ${account.current_balance >= account.opening_balance ? 'text-positive' : 'text-negative'}`}
            />
          </div>
        </div>

        {/* Notes */}
        {account.notes && (
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-600 text-muted-foreground mb-1">{t('people.form.notes', { ns: 'portal' })}</p>
            <p className="text-sm text-foreground">{account.notes}</p>
          </div>
        )}

        {/* Recent Transactions */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-700 text-foreground">{t('transactions.recentTransactions', { ns: 'portal', defaultValue: 'Recent Transactions' })}</h3>
          </div>
          {loading ? (
            <div className="divide-y divide-border">
              {[...Array(5)].map((_, i) => (
                <div key={`skel-dp-${i}`} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                  <div className="w-8 h-8 rounded-lg bg-muted flex-shrink-0" />
                  <div className="flex-1">
                    <div className="h-3 bg-muted rounded w-28 mb-1.5" />
                    <div className="h-2.5 bg-muted rounded w-16" />
                  </div>
                  <div className="h-4 bg-muted rounded w-16" />
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="px-4 py-8">
              <EmptyState icon={Receipt} title={t('common.empty.noTransactions', { defaultValue: t('empty.noTransactions', { ns: 'common' }) })} description={t('accounts.detail.noTransactionsYet', { ns: 'portal', defaultValue: 'No transactions for this account yet.' })} />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {transactions.map((txn) => (
                <div key={txn.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    txn.transaction_type === 'income' ? 'bg-positive-soft' : 'bg-muted'
                  }`}>
                    {txn.transaction_type === 'income'
                      ? <TrendingUp size={14} className="text-positive" />
                      : txn.transaction_type === 'transfer'
                      ? <ArrowUpDown size={14} className="text-info" />
                      : <TrendingDown size={14} className="text-muted-foreground" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-600 text-foreground truncate">{txn.merchant || txn.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {txn.category?.name
                        ? translateSystemCategoryName(txn.category.name, (key, options) =>
                            t(key, { ...(options || {}), ns: 'common' })
                          )
                        : t('reports.chartLabels.uncategorized', { ns: 'portal' })} · {txn.transaction_date}
                    </p>
                  </div>
                  <span className={`text-sm font-700 font-tabular flex-shrink-0 ${txn.transaction_type === 'income' ? 'text-positive' : 'text-foreground'}`}>
                    <FormattedCurrencyAmount
                      amount={txn.transaction_type === 'income' ? txn.amount : -Math.abs(txn.amount)}
                      currencyCode={txn.currency}
                      className={txn.transaction_type === 'income' ? 'text-positive' : 'text-foreground'}
                    />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
