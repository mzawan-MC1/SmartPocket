'use client';
import React, { useEffect, useState } from 'react';
import { X, TrendingDown, TrendingUp, ArrowUpDown, Receipt } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getAccountCurrencyHistory, getTransactions, type Transaction, type FinancialAccount } from '@/lib/finance';
import EmptyState from '@/components/ui/EmptyState';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { translateSystemCategoryName } from '@/lib/system-category-display';
import Badge from '@/components/ui/Badge';
import {
  getFinancialAccountOwnershipType,
  isDefaultBankAccount,
  isDefaultCashAccount,
} from '@/lib/financial-account-utils';
import type { AccountCurrencyHistoryItem } from '@/lib/financial-account-currency-change';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/lib/locale';

interface AccountDetailPanelProps {
  account: FinancialAccount;
  onClose: () => void;
}

function formatExchangeRateValue(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatHistoryDateTime(value: string | null | undefined, locale: string) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

export default function AccountDetailPanel({ account, onClose }: AccountDetailPanelProps) {
  const { t } = useTranslation(['portal', 'common']);
  const { language } = useLanguage();
  const locale = getIntlLocale(language);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currencyHistory, setCurrencyHistory] = useState<AccountCurrencyHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setHistoryLoading(true);
    Promise.all([
      getTransactions({ accountId: account.id, limit: 20 }),
      getAccountCurrencyHistory(account.id).catch(() => []),
    ])
      .then(([nextTransactions, nextHistory]) => {
        setTransactions(nextTransactions);
        setCurrencyHistory(nextHistory);
      })
      .catch(console.error)
      .finally(() => {
        setLoading(false);
        setHistoryLoading(false);
      });
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
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="default" className="bg-white/15 text-white border-white/20">
                  {getFinancialAccountOwnershipType(account) === 'shared'
                    ? t('accounts.sharedOwnershipLabel', { ns: 'portal', defaultValue: 'Shared' })
                    : getFinancialAccountOwnershipType(account) === 'business'
                      ? t('accounts.businessOwnershipLabel', { ns: 'portal', defaultValue: 'Business' })
                      : getFinancialAccountOwnershipType(account) === 'other'
                        ? t('accounts.otherOwnershipLabel', { ns: 'portal', defaultValue: 'Other' })
                        : t('accounts.personalOwnershipLabel', { ns: 'portal', defaultValue: 'Personal' })}
                </Badge>
                {isDefaultCashAccount(account) ? (
                  <Badge variant="warning" className="bg-white text-warning border-white">
                    {t('accounts.defaultCashBadge', { ns: 'portal', defaultValue: 'Default Cash' })}
                  </Badge>
                ) : null}
                {isDefaultBankAccount(account) ? (
                  <Badge variant="warning" className="bg-white text-warning border-white">
                    {t('accounts.defaultBankBadge', { ns: 'portal', defaultValue: 'Default Bank' })}
                  </Badge>
                ) : null}
              </div>
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

        {(account.bank_name || account.account_holder_name || account.account_number_masked || account.iban || account.swift_bic || account.branch_name || account.bank_account_type) ? (
          <div className="px-4 py-3 border-b border-border space-y-2">
            <p className="text-xs font-600 text-muted-foreground mb-1">
              {t('accounts.form.bankDetailsTitle', { ns: 'portal', defaultValue: 'Bank details' })}
            </p>
            {account.bank_name ? <p className="text-sm text-foreground">{t('accounts.form.bankName', { ns: 'portal', defaultValue: 'Bank name' })}: {account.bank_name}</p> : null}
            {account.account_holder_name ? <p className="text-sm text-foreground">{t('accounts.form.accountHolderName', { ns: 'portal', defaultValue: 'Account holder name' })}: {account.account_holder_name}</p> : null}
            {account.account_number_masked ? <p className="text-sm text-foreground">{t('accounts.form.maskedAccountNumber', { ns: 'portal', defaultValue: 'Masked account number' })}: {account.account_number_masked}</p> : null}
            {account.iban ? <p className="text-sm text-foreground">{t('accounts.form.iban', { ns: 'portal', defaultValue: 'IBAN' })}: {account.iban}</p> : null}
            {account.swift_bic ? <p className="text-sm text-foreground">{t('accounts.form.swiftBic', { ns: 'portal', defaultValue: 'SWIFT / BIC' })}: {account.swift_bic}</p> : null}
            {account.branch_name ? <p className="text-sm text-foreground">{t('accounts.form.branchName', { ns: 'portal', defaultValue: 'Branch name' })}: {account.branch_name}</p> : null}
            {account.bank_account_type ? <p className="text-sm text-foreground">{t('accounts.form.bankAccountType', { ns: 'portal', defaultValue: 'Bank account type' })}: {account.bank_account_type.replace('_', ' ')}</p> : null}
          </div>
        ) : null}

        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-600 text-muted-foreground">
              {t('accounts.currencyChange.historyTitle', {
                ns: 'portal',
                defaultValue: 'Currency history',
              })}
            </p>
            <span className="text-xs text-muted-foreground">
              {t('accounts.currencyChange.historyAction', {
                ns: 'portal',
                defaultValue: 'View currency history',
              })}
            </span>
          </div>
          {historyLoading ? (
            <p className="mt-2 text-xs text-muted-foreground">{t('status.loading', { ns: 'common' })}</p>
          ) : currencyHistory.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t('accounts.currencyChange.noHistory', {
                ns: 'portal',
                defaultValue: 'No currency changes recorded for this account.',
              })}
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {currencyHistory.map((item) => (
                <div key={item.id} className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-700 text-foreground">
                      {item.actionType === 'currency_correction'
                        ? t('accounts.currencyChange.historyCorrected', {
                            ns: 'portal',
                            defaultValue: 'Corrected',
                          })
                        : t('accounts.currencyChange.historyConverted', {
                            ns: 'portal',
                            defaultValue: 'Converted',
                          })}
                    </p>
                    <Badge variant={item.currentStatus === 'current' ? 'active' : 'default'}>
                      {item.currentStatus === 'current'
                        ? t('status.active', { ns: 'common' })
                        : t('status.archived', { ns: 'common' })}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm text-foreground">
                    <span>{item.previousCurrency}</span>
                    <span aria-hidden="true">→</span>
                    <span>{item.newCurrency}</span>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 max-[480px]:grid-cols-1">
                      <span>{t('accounts.currencyChange.previousBalanceLabel', {
                        ns: 'portal',
                        defaultValue: 'Previous balance',
                      })}</span>
                      <FormattedCurrencyAmount amount={item.previousBalance} currencyCode={item.previousCurrency} textOnly className="text-right text-xs text-muted-foreground max-[480px]:text-left" />
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 max-[480px]:grid-cols-1">
                      <span>{t('accounts.currencyChange.resultingBalanceLabel', {
                        ns: 'portal',
                        defaultValue: 'Resulting balance',
                      })}</span>
                      <FormattedCurrencyAmount amount={item.resultingBalance} currencyCode={item.newCurrency} textOnly className="text-right text-xs text-muted-foreground max-[480px]:text-left" />
                    </div>
                    {item.exchangeRate !== null ? (
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 max-[480px]:grid-cols-1">
                        <span>{t('accounts.currencyChange.exchangeRateLabel', {
                          ns: 'portal',
                          defaultValue: 'Exchange rate',
                        })}</span>
                        <span className="text-right text-foreground max-[480px]:text-left">
                          {formatExchangeRateValue(item.exchangeRate, locale)}
                        </span>
                      </div>
                    ) : null}
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 max-[480px]:grid-cols-1">
                      <span>{t('accounts.currencyChange.changeDateLabel', {
                        ns: 'portal',
                        defaultValue: 'Change date',
                      })}</span>
                      <span className="text-right text-foreground max-[480px]:text-left">
                        {formatHistoryDateTime(item.confirmedAt || item.createdAt, locale)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
                        : t('categories.uncategorized', {
                            ns: 'portal',
                            defaultValue: t('common.uncategorized', {
                              ns: 'common',
                              defaultValue: 'Uncategorized',
                            }),
                          })} · {txn.transaction_date}
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
