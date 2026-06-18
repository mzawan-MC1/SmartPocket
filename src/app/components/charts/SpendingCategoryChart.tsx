'use client';
import React, { useCallback, useEffect, useState } from 'react';
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

function CustomTooltip({ active, payload, currencyCode }: any) {
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
        {((item.value / total) * 100).toFixed(1)}% of total
      </p>
    </div>
  );
}

export default function SpendingCategoryChart({
  activePeriod,
}: {
  activePeriod: DashboardActivePeriod;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [data, setData] = useState<CategorySpend[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reportingCurrency, setReportingCurrency] = useState('USD');

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
        const name = category?.name ?? 'Uncategorized';
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
        setErrorMessage('Some historical exchange rates are unavailable for this period, so the chart omits those points.');
      }
    } catch (error) {
      console.error('SpendingCategoryChart error:', error);
      setErrorMessage('The chart period could not be calculated.');
    } finally {
      setLoading(false);
    }
  }, [activePeriod.endDate, activePeriod.startDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPocketDataChanged(['dashboard', 'transactions'], 'SpendingCategoryChart', async () => {
    await load();
  });

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-sm text-muted-foreground">{errorMessage || `No expense data for this ${activePeriod.mode === 'month' ? 'month' : 'pay period'}`}</p>
        <p className="text-xs text-muted-foreground">Add expense transactions to see spending by category.</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 h-full">
      <div className="w-[160px] h-full flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={72}
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
            <Tooltip content={<CustomTooltip currencyCode={reportingCurrency} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="flex-1 grid grid-cols-1 gap-1.5 overflow-y-auto max-h-[200px] scrollbar-thin pr-1">
        {data.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 cursor-default"
            onMouseEnter={() => setActiveId(item.id)}
            onMouseLeave={() => setActiveId(null)}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
            <span className="text-xs text-muted-foreground flex-1 truncate">{item.name}</span>
            <span className="text-xs font-600 font-tabular text-foreground">
              {formatCurrencyValue(item.value, reportingCurrency)}
            </span>
            <span className="text-[10px] text-muted-foreground w-10 text-right">
              {total > 0 ? ((item.value / total) * 100).toFixed(0) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
