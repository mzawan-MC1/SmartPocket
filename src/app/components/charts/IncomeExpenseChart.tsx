'use client';
import React, { useCallback, useEffect, useState } from 'react';
import {
  isPersonalExpenseTransaction,
  getDashboardMonthContext,
  shiftDashboardMonth,
  isPersonalIncomeTransaction,
  loadAccountInclusionMap,
  loadTransactionLedgerSummaryMap,
  type Transaction,
} from '@/lib/finance';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { createClient } from '@/lib/supabase/client';
import { useSmartPocketDataChanged } from '@/lib/data-change';

interface MonthlyPoint {
  month: string;
  income: number;
  expenses: number;
}

type TransactionAmountRow = Pick<Transaction, 'id' | 'account_id' | 'transaction_type' | 'amount' | 'transaction_date' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>;

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card-elevated-md p-3 min-w-[140px]">
      <p className="text-xs font-600 text-muted-foreground mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={`tt-${entry.name}`} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-xs text-muted-foreground capitalize">{entry.name}</span>
          </div>
          <span className="text-xs font-700 font-tabular text-foreground">
            ${entry.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function IncomeExpenseChart({
  selectedMonth,
}: {
  selectedMonth: string;
}) {
  const [data, setData] = useState<MonthlyPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const monthContext = getDashboardMonthContext(selectedMonth);
      const firstMonthContext = getDashboardMonthContext(shiftDashboardMonth(monthContext.monthKey, -5));
      const start = firstMonthContext.monthStart;
      const end = monthContext.monthEnd;

      const [{ data: txns }, ledgerSummaryByTransactionId, accountInclusionById] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, account_id, transaction_type, amount, transaction_date, expense_owner, paid_by, paid_from, use_held_balance')
          .gte('transaction_date', start)
          .lte('transaction_date', end)
          .in('transaction_type', ['income', 'expense']),
        loadTransactionLedgerSummaryMap(supabase),
        loadAccountInclusionMap(supabase),
      ]);

      const monthMap = new Map<string, MonthlyPoint>();
      for (let i = 5; i >= 0; i -= 1) {
        const period = getDashboardMonthContext(shiftDashboardMonth(monthContext.monthKey, -i));
        const monthDate = new Date(`${period.monthStart}T00:00:00`);
        const key = period.monthKey;
        monthMap.set(key, {
          month: monthDate.toLocaleString('en-US', { month: 'short' }),
          income: 0,
          expenses: 0,
        });
      }

      for (const txn of (txns || []) as TransactionAmountRow[]) {
        const key = txn.transaction_date.slice(0, 7);
        const month = monthMap.get(key);
        if (!month) continue;
        if (isPersonalIncomeTransaction(txn, ledgerSummaryByTransactionId, accountInclusionById)) {
          month.income += Number(txn.amount);
        }
        if (isPersonalExpenseTransaction(txn, ledgerSummaryByTransactionId, accountInclusionById)) {
          month.expenses += Number(txn.amount);
        }
      }

      setData(Array.from(monthMap.values()));
    } catch (error) {
      console.error('IncomeExpenseChart error:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPocketDataChanged(['dashboard', 'transactions'], 'IncomeExpenseChart', async () => {
    await load();
  });

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (data.every((d) => d.income === 0 && d.expenses === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-sm text-muted-foreground">No transaction data yet</p>
        <p className="text-xs text-muted-foreground">Add income and expense transactions to see trends</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--positive)" stopOpacity={0.2} />
            <stop offset="95%" stopColor="var(--positive)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--negative)" stopOpacity={0.15} />
            <stop offset="95%" stopColor="var(--negative)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 500 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 500 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="income"
          stroke="var(--positive)"
          strokeWidth={2}
          fill="url(#incomeGrad)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <Area
          type="monotone"
          dataKey="expenses"
          stroke="var(--negative)"
          strokeWidth={2}
          fill="url(#expenseGrad)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '11px', fontWeight: 500, paddingTop: '8px' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
