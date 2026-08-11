'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  Wallet,
  ArrowRight,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { getAccounts, type FinancialAccount } from '@/lib/finance';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import CurrencySymbol from '@/components/currency/CurrencySymbol';
import { useLanguage } from '@/contexts/LanguageContext';
import { getFinancialAccountDisplayLabel } from '@/lib/financial-account-utils';
import { getIcon, getAccountTypeLabel, GRADIENT_MAP } from '@/app/financial-accounts/components/account-display';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { getCurrencyByCode } from '@/lib/reference-data/lookups';

interface AccountPreviewCardsProps {
  hideSensitive?: boolean;
  periodNetByAccountId?: Map<string, number> | null;
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

function AccountCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 p-3 h-full flex flex-col justify-between gap-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-muted flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="h-3.5 bg-muted rounded w-28" />
          <div className="h-2.5 bg-muted rounded w-16" />
        </div>
      </div>
      <div className="h-6 bg-muted rounded w-24" />
    </div>
  );
}

const MASKED_TEXT = '••••••';

export default function AccountPreviewCards({ hideSensitive = false, periodNetByAccountId }: AccountPreviewCardsProps) {
  const { t } = useTranslation(['portal', 'common']);
  const { language } = useLanguage();
  const isArabic = language === 'ar';
  const { data: referenceData } = useClientReferenceData();
  const currencies = referenceData?.snapshot.currencies ?? [];
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

  useSmartPocketDataChanged(['financial_accounts', 'transactions'], 'AccountPreviewCards', async () => {
    await load();
  });

  const renderMaskedAmount = (
    currencyCode: string,
    size: 'xs' | 'sm' | 'md' | 'lg' | 'xl',
    className = '',
    symbolClassName = ''
  ) => {
    const currency = getCurrencyByCode(currencies, currencyCode);
    return (
      <span
        dir="ltr"
        className={`inline-flex items-baseline whitespace-nowrap font-tabular ${className}`.trim()}
        aria-label={t('accounts.hiddenBalance', { ns: 'portal', defaultValue: 'Hidden balance' })}
        title={t('accounts.hiddenBalance', { ns: 'portal', defaultValue: 'Hidden balance' })}
      >
        {currency ? (
          <CurrencySymbol currency={currency} size={size} className={symbolClassName || 'text-inherit'} />
        ) : (
          <span>{currencyCode}</span>
        )}
        <span className="ms-[0.18em]">{MASKED_TEXT}</span>
      </span>
    );
  };

  if (loading) {
    return (
      <>
        {[0, 1, 2, 3].map((i) => (
          <AccountCardSkeleton key={`account-skel-${i}`} />
        ))}
      </>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="md:col-span-5 col-span-1 rounded-2xl border border-dashed border-border/70 p-4 text-center bg-muted/20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-muted/40 flex items-center justify-center text-muted-foreground">
            <Wallet size={18} />
          </div>
          <div>
            <h3 className="text-[14px] font-700 text-foreground">
              {t('accounts.emptyTitle', { ns: 'portal', defaultValue: 'No accounts yet' })}
            </h3>
            <p className="mt-1 text-[11.5px] text-muted-foreground max-w-sm">
              {t('accounts.emptyDescription', {
                ns: 'portal',
                defaultValue: 'Add a financial account to start tracking your balances.',
              })}
            </p>
          </div>
          <Link
            href="/financial-accounts"
            className="inline-flex items-center gap-1.5 text-[12px] font-700 text-accent hover:underline"
          >
            {t('accounts.addAction', { ns: 'portal', defaultValue: 'Add Account' })}
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    );
  }

  const visibleAccounts = accounts.slice(0, 4);
  const hiddenBalanceLabel = t('accounts.hiddenBalance', {
    ns: 'portal',
    defaultValue: 'Hidden balance',
  });

  return (
    <>
      {visibleAccounts.map((acct) => {
        const Icon = getIcon(acct.account_type);
        const colorClass = getAccountColorClass(acct.account_type, acct.current_balance);
        const isDefaultCash = acct.is_system_default === true && acct.system_default_type === 'personal_cash';
        const isDefaultBank = acct.is_system_default === true && acct.system_default_type === 'personal_bank';

        let displayName = acct.name;
        if (isDefaultCash) {
          const defaultCashLabel = t('transfers.form.systemDefaultLabels.personalCash', {
            ns: 'portal',
            defaultValue: 'Default Cash',
          });
          const typeLabel = t('accounts.types.cash', { ns: 'portal' });
          if (displayName === defaultCashLabel || displayName === `${typeLabel} · ${defaultCashLabel}`) {
            displayName = typeLabel;
          }
        } else if (isDefaultBank) {
          const defaultBankLabel = t('transfers.form.systemDefaultLabels.personalBank', {
            ns: 'portal',
            defaultValue: 'Default Bank',
          });
          const typeLabel = t('accounts.types.bank', { ns: 'portal' });
          if (displayName === defaultBankLabel || displayName === `${typeLabel} · ${defaultBankLabel}`) {
            displayName = typeLabel;
          }
        }

        let secondaryLabel: string;
        if (isDefaultCash || isDefaultBank) {
          secondaryLabel = t('dashboardSections.defaultAccount', {
            defaultValue: 'Default',
          });
        } else {
          secondaryLabel = getAccountTypeLabel(acct.account_type, (key: string) =>
            t(key, { ns: 'portal' })
          );
        }

        const gradient = GRADIENT_MAP[acct.account_type] || GRADIENT_MAP.other;
        const rawNet = periodNetByAccountId?.get(acct.id);
        const hasMovement = typeof rawNet === 'number' && !Object.is(rawNet, -0);
        const movementDir: 'up' | 'down' | null = hasMovement
          ? rawNet > 0
            ? 'up'
            : 'down'
          : null;

        return (
          <div
            key={acct.id}
            className="overflow-hidden rounded-[20px] border border-border/80 bg-card hover:shadow-card-md shadow-card-sm transition-all duration-200 h-full flex flex-col justify-between gap-2 min-w-0"
          >
            <div className={`relative overflow-hidden bg-gradient-to-r ${gradient} px-3 py-2.5`}>
              <div className="pointer-events-none absolute top-0 right-0 h-16 w-16 translate-x-6 -translate-y-6 rounded-full bg-white opacity-10" />
              <div className="relative flex items-center gap-2.5 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/18 backdrop-blur-sm border border-white/20 flex-shrink-0">
                  <Icon size={16} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-800 text-white truncate leading-tight">
                    {displayName}
                  </p>
                  <p className={`text-[10.5px] text-white/75 capitalize mt-[2px] leading-tight ${isArabic ? 'leading-4' : ''}`}>
                    {secondaryLabel}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-3 pb-2.5 pt-1 min-h-[40px] w-full flex justify-end items-center min-w-0">
              {movementDir === 'up' && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-positive/10 text-positive me-1 flex-shrink-0" aria-hidden="true">
                  <TrendingUp size={12} strokeWidth={2.25} />
                </span>
              )}
              {movementDir === 'down' && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-negative/10 text-negative me-1 flex-shrink-0" aria-hidden="true">
                  <TrendingDown size={12} strokeWidth={2.25} />
                </span>
              )}
              {hideSensitive ? (
                renderMaskedAmount(
                  acct.currency,
                  'sm',
                  '',
                  'text-[13.5px] font-700 text-foreground/80'
                )
              ) : (
                <FormattedCurrencyAmount
                  amount={Number(acct.current_balance) || 0}
                  currencyCode={acct.currency}
                  size="sm"
                  numberClassName="text-[15.5px] font-800 font-tabular text-foreground"
                  symbolClassName="text-[13.5px] font-700 text-foreground/80"
                />
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
