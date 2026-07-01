'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Building2, Wallet, CreditCard, Smartphone, PiggyBank, ArrowRight, Landmark } from 'lucide-react';
import { getAccounts, type FinancialAccount } from '@/lib/finance';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import EmptyState from '@/components/ui/EmptyState';
import SectionCard from '@/components/ui/SectionCard';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useLanguage } from '@/contexts/LanguageContext';
import { getFinancialAccountDisplayLabel } from '@/lib/financial-account-utils';


function getAccountIcon(type: string) {
  switch (type) {
    case 'bank': return Building2;
    case 'credit_card': return CreditCard;
    case 'savings': return PiggyBank;
    case 'cash': return Wallet;
    case 'digital_wallet': return Smartphone;
    case 'investment': return Landmark;
    default: return Wallet;
  }
}

function getAccountColorClass(type: string, balance: number) {
  if (balance < 0) return 'bg-negative-soft text-negative';
  switch (type) {
    case 'bank': return 'bg-primary/10 text-primary';
    case 'credit_card': return 'bg-negative-soft text-negative';
    case 'savings': return 'bg-positive-soft text-positive';
    case 'cash': return 'bg-warning-soft text-warning';
    case 'digital_wallet': return 'bg-info-soft text-info';
    default: return 'bg-muted text-muted-foreground';
  }
}

export default function AccountBalances() {
  const { t } = useTranslation(['portal', 'common']);
  const { language } = useLanguage();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const activeAccounts = await getAccounts({ activeOnly: true });
      setAccounts(activeAccounts);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPocketDataChanged(['financial_accounts', 'transactions'], 'AccountBalances', async () => {
    await load();
  });

  const visibleAccounts = accounts.slice(0, 5);

  const getAccountTypeLabel = (type: string) => {
    switch (type) {
      case 'bank':
        return t('accounts.types.bank', { ns: 'portal' });
      case 'credit_card':
        return t('accounts.types.creditCard', { ns: 'portal' });
      case 'savings':
        return t('accounts.types.savings', { ns: 'portal' });
      case 'cash':
        return t('accounts.types.cash', { ns: 'portal' });
      case 'digital_wallet':
        return t('accounts.types.digitalWallet', { ns: 'portal' });
      case 'investment':
        return t('accounts.types.investment', { ns: 'portal' });
      default:
        return t('accounts.types.other', { ns: 'portal' });
    }
  };
  const totalByCurrency = Array.from(
    accounts.reduce((map, account) => {
      map.set(account.currency, (map.get(account.currency) || 0) + Number(account.current_balance || 0));
      return map;
    }, new Map<string, number>())
  );

  return (
    <SectionCard
      title={t('dashboardAccounts.title', { ns: 'portal' })}
      description={t('accounts.dashboardDescription', { ns: 'portal' })}
      className="flex h-full flex-col rounded-[28px] border border-border/80 bg-card shadow-card-sm transition-shadow duration-200 hover:shadow-card-md"
      action={
        <Link href="/financial-accounts" className="link-accent text-sm">
          {t('actions.viewAll', { ns: 'common' })} <ArrowRight size={13} />
        </Link>
      }
      bodyClassName="flex flex-1 flex-col p-3"
    >

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={`skel-acct-${i}`} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/15 px-3.5 py-3 animate-pulse">
              <div className="w-8 h-8 rounded-lg bg-muted flex-shrink-0" />
              <div className="flex-1">
                <div className="h-3 bg-muted rounded w-28 mb-1.5" />
                <div className="h-2.5 bg-muted rounded w-16" />
              </div>
              <div className="h-4 bg-muted rounded w-20" />
            </div>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={t('accounts.emptyTitle', { ns: 'portal' })}
          description={t('accounts.emptyDescription', { ns: 'portal' })}
          variant="compact"
          tone="neutral"
          className="flex flex-1 items-center justify-center px-4 py-6"
        />
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="space-y-2">
          {visibleAccounts.map((acct) => {
            const Icon = getAccountIcon(acct.account_type);
            const colorClass = getAccountColorClass(acct.account_type, acct.current_balance);
            const lastActivity = new Date(acct.updated_at).toLocaleDateString(
              language === 'ar' ? 'ar' : language === 'fr' ? 'fr' : language === 'ru' ? 'ru' : 'en-US',
              { month: 'short', day: 'numeric' }
            );
            return (
              <div key={acct.id} className="flex items-center gap-3 rounded-2xl border border-transparent bg-muted/15 px-3.5 py-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${colorClass} flex-shrink-0`}>
                  <Icon size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-700 text-foreground truncate">
                    {getFinancialAccountDisplayLabel(acct, {
                      includeDefaultLabel: true,
                    })}
                  </p>
                  <p className="text-[11px] text-muted-foreground capitalize">{getAccountTypeLabel(acct.account_type)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <FormattedCurrencyAmount
                    amount={Number(acct.current_balance)}
                    currencyCode={acct.currency}
                    size="sm"
                    className={`text-sm font-700 font-tabular ${acct.current_balance < 0 ? 'text-negative' : 'text-foreground'}`}
                    showCode
                  />
                  <p className="text-[11px] text-muted-foreground">{lastActivity}</p>
                </div>
              </div>
            );
          })}
          </div>
          <div className="mt-2 flex items-start justify-between gap-3 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3.5">
            <div>
              <p className="text-sm font-700 text-foreground">{t('dashboardAccounts.totalBalance', { ns: 'portal' })}</p>
              <p className="text-xs text-muted-foreground">{t('dashboardMetrics.acrossActiveAccounts', { ns: 'portal' })}</p>
            </div>
            <div className="text-right">
              {totalByCurrency.map(([currency, amount]) => (
                <FormattedCurrencyAmount
                  key={currency}
                  amount={amount}
                  currencyCode={currency}
                  size="sm"
                  className="text-sm font-800 font-tabular text-foreground"
                  showCode
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
