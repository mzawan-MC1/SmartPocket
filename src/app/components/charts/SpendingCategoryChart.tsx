'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { createClient } from '@/lib/supabase/client';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import {
  convertHistoricalAmountWithSnapshots,
  getHistoricalReportContext,
  loadAccountInclusionMap,
  loadTransactionLedgerSummaryMap,
  shouldIncludeInBudgetSpending,
  type DashboardActivePeriod,
  type Transaction,
} from '@/lib/finance';
import { translateSystemCategoryName } from '@/lib/system-category-display';

const COLORS = ['#0f3460', '#0ea5a0', '#6ee7e7', '#059669', '#d97706', '#dc2626', '#8b5cf6', '#94a3b8', '#f59e0b', '#10b981'];

interface CategorySpend {
  id: string;
  name: string;
  value: number;
  color: string;
}

interface ExpenseTransactionRow extends Pick<Transaction, 'id' | 'account_id' | 'amount' | 'transaction_type' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'> {
  category: { id: string; name: string; color: string | null } | Array<{ id: string; name: string; color: string | null }> | null;
}

function formatCurrencyValue(value: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currencyCode} ${value.toFixed(0)}`;
  }
}

function CustomTooltip({ active, payload, currencyCode, t }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const total = item?.payload?.total ?? 1;
  return (
    <div className="card-elevated-md p-3">
      <p className="text-xs font-600 text-foreground">{item.name}</p>
      <p className="text-sm font-700 font-tabular text-foreground mt-0.5">
        {formatCurrencyValue(Number(item.value || 0), currencyCode)}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('reports.chartLabels.ofTotal', {
          percent: ((item.value / total) * 100).toFixed(1),
          defaultValue: '{{percent}}% of total',
        })}
      </p>
    </div>
  );
}

export default function SpendingCategoryChart({
  activePeriod,
}: {
  activePeriod: DashboardActivePeriod;
}) {
  const { t } = useTranslation('portal');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [data, setData] = useState<CategorySpend[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reportingCurrency, setReportingCurrency] = useState('USD');
  const topCategory = data[0] ?? null;
  const summaryCards = useMemo(() => ([
    {
      id: 'total',
      label: t('dashboardCharts.categorySummary.totalSpending', { defaultValue: 'Total spending' }),
      value: formatCurrencyValue(total, reportingCurrency),
    },
    {
      id: 'top',
      label: t('dashboardCharts.categorySummary.topCategory', { defaultValue: 'Top category' }),
      value: topCategory?.name || '—',
      detail: topCategory ? formatCurrencyValue(topCategory.value, reportingCurrency) : undefined,
    },
  ]), [reportingCurrency, t, topCategory]);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const supabase = createClient();
      const start = activePeriod.startDate;
      const end = activePeriod.endDate;

      const [{ data: txns }, ledgerSummaryByTransactionId, accountInclusionById] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, account_id, amount, currency, transaction_type, transaction_date, expense_owner, paid_by, paid_from, use_held_balance, category:categories(id, name, color)')
          .eq('transaction_type', 'expense')
          .gte('transaction_date', start)
          .lte('transaction_date', end),
        loadTransactionLedgerSummaryMap(supabase),
        loadAccountInclusionMap(supabase),
      ]);

      const transactions = (txns || []) as Array<ExpenseTransactionRow & Pick<Transaction, 'currency' | 'transaction_date'>>;
      if (!transactions.length) {
        setData([]);
        setTotal(0);
        return;
      }

      const historyContext = await getHistoricalReportContext(
        transactions.map((transaction) => ({ transaction_date: transaction.transaction_date }))
      );
      setReportingCurrency(historyContext.reportingCurrency);
      const categoryMap = new Map<string, { name: string; value: number; color: string | null }>();
      let hadMissingRates = false;
      for (const transaction of transactions) {
        if (!shouldIncludeInBudgetSpending(transaction, ledgerSummaryByTransactionId, accountInclusionById)) continue;
        const category = Array.isArray(transaction.category) ? transaction.category[0] : transaction.category;
        const key = category?.id ?? 'uncategorized';
        const name = category?.name
          ? translateSystemCategoryName(category.name, (key, options) =>
              t(key, { ...(options || {}), ns: 'common' })
            )
          : t('reports.chartLabels.uncategorized', { defaultValue: 'Uncategorized' });
        const color = category?.color ?? null;
        const conversion = convertHistoricalAmountWithSnapshots({
          amount: Number(transaction.amount || 0),
          fromCurrency: transaction.currency || historyContext.reportingCurrency,
          reportingCurrency: historyContext.reportingCurrency,
          rateDate: transaction.transaction_date,
          snapshots: historyContext.snapshots,
        });
        if (conversion.convertedAmount === null) {
          hadMissingRates = true;
          continue;
        }
        const existing = categoryMap.get(key);
        if (existing) {
          existing.value += conversion.convertedAmount;
        } else {
          categoryMap.set(key, { name, value: conversion.convertedAmount, color });
        }
      }

      const sorted = Array.from(categoryMap.entries())
        .map(([id, value], index) => ({
          id,
          name: value.name,
          value: value.value,
          color: value.color ?? COLORS[index % COLORS.length],
        }))
        .sort((left, right) => right.value - left.value)
        .slice(0, 8);

      const grandTotal = sorted.reduce((sum, item) => sum + item.value, 0);
      setTotal(grandTotal);
      setData(sorted.map((item) => ({ ...item, total: grandTotal } as CategorySpend)));
      if (hadMissingRates) {
        setErrorMessage(t('reports.chartLabels.missingHistoricalRates', {
          defaultValue: 'Some historical exchange rates are unavailable for this period.',
        }));
      }
    } catch (error) {
      console.error('SpendingCategoryChart error:', error);
      setErrorMessage(t('reports.chartLabels.chartPeriodFailed', {
        defaultValue: 'Unable to load category spending for this period.',
      }));
    } finally {
      setLoading(false);
    }
  }, [activePeriod.endDate, activePeriod.startDate, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPocketDataChanged(['dashboard', 'transactions'], 'SpendingCategoryChart', async () => {
    await load();
  });

  if (loading) {
    return <div className="flex h-[300px] items-center justify-center"><div className="h-6 w-6 rounded-full border-2 border-accent border-t-transparent animate-spin" /></div>;
  }

  if (!data.length) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-sm text-muted-foreground">
          {errorMessage || t(activePeriod.mode === 'month' ? 'reports.chartLabels.noExpenseDataMonth' : 'reports.chartLabels.noExpenseDataPayPeriod', {
            defaultValue: activePeriod.mode === 'month'
              ? 'No expense transactions in this month'
              : 'No expense transactions in this pay period',
          })}
        </p>
        <p className="text-[12.5px] text-muted-foreground">
          {t('reports.chartLabels.addExpensesToSeeCategories', {
            defaultValue: 'Add expense transactions to see category breakdown.',
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(15rem,0.88fr)_minmax(0,1.12fr)] lg:items-start">
      <div className="grid gap-3 sm:grid-cols-[minmax(14rem,15.5rem)_minmax(0,1fr)] lg:grid-cols-1">
        <div className="rounded-[24px] border border-border/80 bg-muted/15 p-4">
          <div className="mx-auto h-[190px] w-full max-w-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={54}
                  outerRadius={82}
                  paddingAngle={2}
                  dataKey="value"
                  onMouseEnter={(_, index) => setActiveId(data[index]?.id ?? null)}
                  onMouseLeave={() => setActiveId(null)}
                >
                  {data.map((entry) => (
                    <Cell
                      key={entry.id}
                      fill={entry.color}
                      opacity={activeId && activeId !== entry.id ? 0.4 : 1}
                      stroke="none"
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip currencyCode={reportingCurrency} t={t} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-center">
            <p className="text-[11px] font-700 uppercase tracking-[0.14em] text-muted-foreground">
              {t('dashboardCharts.categorySummary.totalSpending', { defaultValue: 'Total spending' })}
            </p>
            <p className="mt-1 text-lg font-800 text-foreground">{formatCurrencyValue(total, reportingCurrency)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {summaryCards.map((card) => (
            <div key={card.id} className="rounded-2xl border border-border/80 bg-card px-3 py-3 shadow-card-sm">
              <p className="text-[11px] font-700 uppercase tracking-[0.12em] text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-sm font-800 text-foreground break-words">{card.value}</p>
              {card.detail ? (
                <p className="mt-1 text-[12px] text-muted-foreground">{card.detail}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-2">
        {data.map((item) => (
          <div
            key={item.id}
            className={`rounded-2xl border px-3 py-2.5 transition-colors ${
              activeId === item.id ? 'border-accent/25 bg-accent/5' : 'border-border/70 bg-card'
            }`}
            onMouseEnter={() => setActiveId(item.id)}
            onMouseLeave={() => setActiveId(null)}
          >
            <div className="flex items-start gap-2.5">
              <span className="mt-1 h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="truncate text-sm font-700 text-foreground">{item.name}</p>
                  <span className="text-[11px] font-700 text-muted-foreground">
                    {total > 0 ? ((item.value / total) * 100).toFixed(0) : 0}%
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="text-sm font-700 font-tabular text-foreground">
                    {formatCurrencyValue(item.value, reportingCurrency)}
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    {t('reports.chartLabels.ofTotal', {
                      percent: ((item.value / total) * 100).toFixed(1),
                      defaultValue: '{{percent}}% of total',
                    })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
