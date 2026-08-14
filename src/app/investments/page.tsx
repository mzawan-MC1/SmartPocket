'use client';
import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import {
  Plus,
  TrendingUp,
  TrendingDown,
  LineChart,
  Briefcase,
  Coins,
  Home as HomeIcon,
  Gem,
  Layers,
  MoreHorizontal,
  Info,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import { getAccounts, type FinancialAccount } from '@/lib/finance';
import { toast } from 'sonner';

interface AssetCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accent: string;
  holdings: number;
  invested: number;
  currentValue: number;
}

const ASSET_CATEGORIES: Array<Omit<AssetCategory, 'holdings' | 'invested' | 'currentValue'>> = [
  {
    id: 'stocks',
    name: 'Stocks',
    description: 'Shares, ETFs, and equities.',
    icon: LineChart,
    accent: '#0ea5e9',
  },
  {
    id: 'crypto',
    name: 'Crypto',
    description: 'Tokens and digital assets.',
    icon: Coins,
    accent: '#8b5cf6',
  },
  {
    id: 'property',
    name: 'Property',
    description: 'Real estate and land holdings.',
    icon: HomeIcon,
    accent: '#f59e0b',
  },
  {
    id: 'commodities',
    name: 'Gold / commodities',
    description: 'Precious metals, energy, and raw materials.',
    icon: Gem,
    accent: '#eab308',
  },
  {
    id: 'funds',
    name: 'Funds',
    description: 'Mutual funds, index funds, and managed portfolios.',
    icon: Layers,
    accent: '#10b981',
  },
  {
    id: 'other',
    name: 'Other investments',
    description: 'Bonds, private equity, collectibles, and more.',
    icon: MoreHorizontal,
    accent: '#6366f1',
  },
];

export default function InvestmentsPage() {
  const { t } = useTranslation(['portal', 'common']);
  const { isRTL } = useLanguage();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingAccounts(true);
    void getAccounts({ activeOnly: true })
      .then((next) => {
        if (!cancelled) setAccounts(next);
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAccounts(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const defaultCurrencyCode = useMemo(() => {
    const first = accounts[0];
    return (first?.currency || 'USD').toUpperCase();
  }, [accounts]);

  const investmentAccounts = accounts.filter(
    (account) => String(account.account_type || '').toLowerCase() === 'investment'
  );

  const totalInvestedFromAccounts = investmentAccounts.reduce(
    (sum, account) => sum + Number(account.opening_balance ?? account.current_balance ?? 0),
    0
  );
  const currentValueFromAccounts = investmentAccounts.reduce(
    (sum, account) => sum + Number(account.current_balance ?? account.opening_balance ?? 0),
    0
  );

  const totalInvested = totalInvestedFromAccounts;
  const currentValue = currentValueFromAccounts;
  const gainLoss = currentValue - totalInvested;
  const gainLossPct = totalInvested > 0 ? (gainLoss / totalInvested) * 100 : 0;
  const gainIsPositive = gainLoss >= 0;

  const categories = useMemo<AssetCategory[]>(() => {
    const total = currentValueFromAccounts;
    return ASSET_CATEGORIES.map((base, index) => {
      const splitShare = total > 0 ? total / ASSET_CATEGORIES.length : 0;
      const approxValue = index === 0 && investmentAccounts.length > 0 ? total : splitShare;
      const approxInvested = approxValue * 0.96;
      return {
        ...base,
        holdings: approxValue > 0 ? 1 : 0,
        invested: approxInvested,
        currentValue: approxValue,
      };
    });
  }, [currentValueFromAccounts, investmentAccounts.length]);

  const activeCategoryTypes = categories.filter((c) => c.holdings > 0).length;

  return (
    <AppLayout activeRoute="/investments" hideMobileFooter>
      <div className="page-section max-[480px]:gap-2.5">
        <PageHeader
          title={t('investments.title', { defaultValue: 'Investments' })}
          description={t('investments.description', {
            defaultValue:
              'Track what you invested, current value, and overall growth in one place.',
          })}
          badge={
            <StatusBadge
              status="info"
              label={t('investments.badge', { defaultValue: 'Portfolio Tracker' })}
            />
          }
          compact
          className="rounded-[24px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] px-3.5 py-3 shadow-card-sm max-[480px]:px-3.5 max-[480px]:py-3"
          actionsClassName="w-full sm:w-auto"
          actions={
            <div className="flex w-full sm:w-auto">
              <button
                onClick={() => {
                  toast.info(
                    t('investments.newInvestmentComingSoon', {
                      defaultValue:
                        'Adding individual investments is coming soon. Investment accounts from Accounts are used as the source of truth.',
                    })
                  );
                }}
                className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[18px] bg-[linear-gradient(135deg,#06a6d8_0%,#1294ff_100%)] px-3.5 py-2.5 text-[14px] font-700 text-white shadow-[0_12px_24px_rgba(18,148,255,0.18)] transition-transform duration-150 hover:-translate-y-[1px] hover:brightness-105 sm:w-auto"
              >
                <Plus size={16} />{' '}
                {t('investments.newInvestmentButton', { defaultValue: 'Add investment' })}
              </button>
            </div>
          }
        />

        {/* Disclaimer */}
        <div className="card-elevated flex items-start gap-2.5 rounded-[18px] border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-[12px] leading-5 text-amber-800">
            {t('investments.disclaimer', {
              defaultValue:
                'Smart Pocket helps you track investments. It does not provide financial advice.',
            })}
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          {[
            {
              id: 'iv-total-invested',
              label: t('investments.totalInvested', { defaultValue: 'Total invested' }),
              amount: totalInvested,
              icon: Briefcase,
              color: 'text-foreground',
              iconTone: 'bg-sky-500/10 text-sky-600',
            },
            {
              id: 'iv-current-value',
              label: t('investments.currentValue', { defaultValue: 'Current value' }),
              amount: currentValue,
              icon: LineChart,
              color: 'text-foreground',
              iconTone: 'bg-violet-500/10 text-violet-600',
            },
            {
              id: 'iv-gain-loss',
              label: t('investments.gainLoss', { defaultValue: 'Gain / loss' }),
              amount: gainLoss,
              icon: gainIsPositive ? TrendingUp : TrendingDown,
              color: gainIsPositive ? 'text-positive' : 'text-negative',
              iconTone: gainIsPositive
                ? 'bg-emerald-500/10 text-emerald-600'
                : 'bg-rose-500/10 text-rose-600',
              suffix:
                totalInvested > 0 ? (
                  <span
                    className={`ml-1.5 text-[11px] font-700 font-tabular ${
                      gainIsPositive ? 'text-positive' : 'text-negative'
                    }`}
                  >
                    {gainIsPositive ? '+' : ''}
                    {gainLossPct.toFixed(2)}%
                  </span>
                ) : null,
            },
            {
              id: 'iv-asset-types',
              label: t('investments.assetTypes', { defaultValue: 'Asset types' }),
              value: `${activeCategoryTypes} / ${categories.length}`,
              icon: Layers,
              color: 'text-foreground',
              iconTone: 'bg-indigo-500/10 text-indigo-600',
            },
          ].map((item) => (
            <div
              key={item.id}
              className="card-elevated rounded-[18px] border border-border/80 bg-card px-2.5 py-2.5 shadow-card-sm max-[480px]:px-2.5"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] font-700 uppercase tracking-[0.08em] text-muted-foreground">
                  {item.label}
                </p>
                <div
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-[10px] ${item.iconTone}`}
                >
                  <item.icon size={14} />
                </div>
              </div>
              {loadingAccounts ? (
                <div className="h-5 w-24 animate-pulse rounded bg-muted" />
              ) : 'amount' in item ? (
                <div className="flex items-baseline">
                  <FormattedCurrencyAmount
                    amount={item.amount ?? 0}
                    currencyCode={defaultCurrencyCode}
                    className={`text-[15px] font-800 font-tabular ${item.color}`}
                    showCode
                  />
                  {item.suffix}
                </div>
              ) : (
                <p className={`text-[15px] font-800 font-tabular ${item.color}`}>{item.value}</p>
              )}
            </div>
          ))}
        </div>

        {/* Investment accounts (real data source) */}
        {investmentAccounts.length > 0 ? (
          <div className="card-elevated rounded-[20px] border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(248,250,252,0.98)_100%)] p-3 shadow-card-sm max-[480px]:p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-[14px] font-800 text-foreground">
                  {t('investments.investmentAccounts.title', {
                    defaultValue: 'Existing investment accounts',
                  })}
                </h2>
                <p className="text-[11.5px] text-muted-foreground">
                  {t('investments.investmentAccounts.subtitle', {
                    defaultValue:
                      'Balances are sourced from your existing accounts. Individual holdings and per-asset tracking will use these accounts as the source of truth.',
                  })}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10.5px] font-700 text-emerald-700">
                <TrendingUp size={12} />{' '}
                {t('investments.investmentAccounts.tag', { defaultValue: 'Real data' })}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {investmentAccounts.map((account) => {
                const invested = Number(account.opening_balance ?? account.current_balance ?? 0);
                const current = Number(account.current_balance ?? account.opening_balance ?? 0);
                const delta = current - invested;
                const pct = invested > 0 ? (delta / invested) * 100 : 0;
                const positive = delta >= 0;
                return (
                  <div
                    key={account.id}
                    className="rounded-[16px] border border-border/80 bg-muted/20 p-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-700 text-foreground">
                          {account.name ||
                            t('investments.investmentAccounts.untitled', {
                              defaultValue: 'Investment account',
                            })}
                        </p>
                        <p className="text-[10.5px] text-muted-foreground">
                          {account.account_number_masked || account.id.slice(0, 8)}
                        </p>
                      </div>
                      <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-violet-500/10 text-violet-600">
                        <Briefcase size={14} />
                      </div>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>
                          {t('investments.investmentAccounts.currentValue', {
                            defaultValue: 'Current value',
                          })}
                        </span>
                        <FormattedCurrencyAmount
                          amount={current}
                          currencyCode={account.currency || defaultCurrencyCode}
                          className="text-[13px] font-800 font-tabular text-foreground"
                          showCode
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>
                          {t('investments.investmentAccounts.performance', {
                            defaultValue: 'Performance',
                          })}
                        </span>
                        <div className="flex items-baseline gap-1.5">
                          <span
                            className={`text-[12px] font-800 font-tabular ${
                              positive ? 'text-positive' : 'text-negative'
                            }`}
                          >
                            {positive ? '+' : ''}
                            <FormattedCurrencyAmount
                              amount={delta}
                              currencyCode={account.currency || defaultCurrencyCode}
                              textOnly
                              compact
                            />
                          </span>
                          {invested > 0 ? (
                            <span
                              className={`text-[11px] font-700 font-tabular ${
                                positive ? 'text-positive' : 'text-negative'
                              }`}
                            >
                              ({positive ? '+' : ''}
                              {pct.toFixed(2)}%)
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Asset Categories */}
        <div className="space-y-2.5 max-[480px]:space-y-2.5 sm:space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-700 text-foreground">
                {t('investments.categories.title', { defaultValue: 'Asset categories' })}
              </h2>
              <p className="text-[11.5px] text-muted-foreground">
                {t('investments.categories.subtitle', {
                  defaultValue:
                    'Common investment types. Categories are illustrative MVP placeholders until the dedicated holdings module is live.',
                })}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-2.5 py-1 text-[10.5px] font-700 text-muted-foreground">
              <Layers size={11} />{' '}
              {t('investments.categories.count', {
                count: categories.length,
                defaultValue: '{{count}} types',
              })}
            </span>
          </div>

          {loadingAccounts ? (
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={`skel-inv-${i}`}
                  className="card-elevated rounded-[20px] border border-border/80 p-3"
                >
                  <div className="h-5 w-36 animate-pulse rounded bg-muted mb-3" />
                  <div className="h-3 w-full animate-pulse rounded bg-muted mb-2" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : categories.length === 0 ? (
            <div className="card-elevated rounded-[22px] border border-border/80 p-4 max-[480px]:p-3">
              <EmptyState
                icon={Briefcase}
                title={t('investments.categories.empty.title', {
                  defaultValue: 'No categories yet',
                })}
                description={t('investments.categories.empty.description', {
                  defaultValue:
                    'Add an investment to start building out your portfolio breakdown.',
                })}
                variant="compact"
                tone="neutral"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
              {categories.map((category) => {
                const Icon = category.icon;
                const delta = category.currentValue - category.invested;
                const pct = category.invested > 0 ? (delta / category.invested) * 100 : 0;
                const positive = delta >= 0;
                const pctOfTotal =
                  currentValue > 0 ? (category.currentValue / currentValue) * 100 : 0;
                return (
                  <div
                    key={category.id}
                    className="card-elevated rounded-[20px] border border-border/80 p-3 transition-shadow duration-200 hover:shadow-card-md max-[480px]:p-3"
                  >
                    <div className="mb-2.5 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                          style={{
                            backgroundColor: `${category.accent}18`,
                            color: category.accent,
                          }}
                        >
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-800 text-foreground">
                            {category.name}
                          </p>
                          <p className="truncate text-[10.5px] text-muted-foreground">
                            {category.description}
                          </p>
                        </div>
                      </div>
                      {category.holdings > 0 ? (
                        <span className="shrink-0 rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-700 text-violet-700">
                          {t('investments.categories.hasHoldings', {
                            count: category.holdings,
                            defaultValue: '{{count}} holding',
                          })}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full border border-border/80 bg-card px-2 py-0.5 text-[10px] font-700 text-muted-foreground">
                          {t('investments.categories.notStarted', {
                            defaultValue: 'Empty',
                          })}
                        </span>
                      )}
                    </div>

                    {/* Allocation bar */}
                    <div className="mb-2.5">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <p className="text-[10.5px] text-muted-foreground">
                          {t('investments.categories.allocation', {
                            defaultValue: 'Portfolio share',
                          })}
                        </p>
                        <span className="text-[11px] font-700 font-tabular text-muted-foreground">
                          {pctOfTotal.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, pctOfTotal)}%`,
                            backgroundColor: category.accent,
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-muted/15 px-2.5 py-2">
                        <p className="text-[10px] text-muted-foreground">
                          {t('investments.categories.invested', { defaultValue: 'Invested' })}
                        </p>
                        <FormattedCurrencyAmount
                          amount={category.invested}
                          currencyCode={defaultCurrencyCode}
                          className="text-[13px] font-800 font-tabular text-foreground"
                          showCode
                        />
                      </div>
                      <div className="rounded-xl bg-muted/15 px-2.5 py-2 text-right">
                        <p className="text-[10px] text-muted-foreground">
                          {t('investments.categories.currentValue', {
                            defaultValue: 'Value',
                          })}
                        </p>
                        <FormattedCurrencyAmount
                          amount={category.currentValue}
                          currencyCode={defaultCurrencyCode}
                          className="text-[13px] font-800 font-tabular text-foreground"
                          showCode
                        />
                      </div>
                    </div>

                    {category.holdings > 0 ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {positive ? (
                            <TrendingUp size={11} className="text-positive" />
                          ) : (
                            <TrendingDown size={11} className="text-negative" />
                          )}
                          <span className="font-700 text-foreground">
                            <span className={positive ? 'text-positive' : 'text-negative'}>
                              {positive ? '+' : ''}
                              <FormattedCurrencyAmount
                                amount={delta}
                                currencyCode={defaultCurrencyCode}
                                textOnly
                                compact
                              />
                            </span>
                          </span>
                        </span>
                        {category.invested > 0 ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border border-border/70 bg-card px-2 py-0.5 text-[10px] font-700 ${
                              positive ? 'text-positive' : 'text-negative'
                            }`}
                          >
                            {positive ? '+' : ''}
                            {pct.toFixed(2)}%
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-2 inline-flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                        <Info size={11} />{' '}
                        {t('investments.categories.mvpHint', {
                          defaultValue: 'No holdings yet; MVP placeholder category.',
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
