'use client';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrencyValue } from '@/lib/currency-formatting';

type IncomeExpenseChartRow = {
  month: string;
  income: number;
  expenses: number;
  net: number;
};

function formatAxisValue(value: number, currencyCode: string) {
  return formatCurrencyValue(value, {
    currencyCode,
    compact: true,
  }).text;
}

function CustomTooltip({ active, payload, label, currencyCode, t }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card-elevated-md p-3 min-w-[150px]">
      <p className="text-xs font-600 text-muted-foreground mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={`rpt-tt-${entry.name}`} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-xs text-muted-foreground capitalize">{entry.name}</span>
          </div>
          <span className="text-xs font-700 font-tabular">
            {formatCurrencyValue(entry.value, { currencyCode }).text}
          </span>
        </div>
      ))}
      <div className="mt-1.5 pt-1.5 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('reports.summary.netChange')}</span>
          <span className={`text-xs font-700 font-tabular ${payload[0]?.value - payload[1]?.value >= 0 ? 'text-positive' : 'text-negative'}`}>
            {formatCurrencyValue(payload[0]?.value - payload[1]?.value, { currencyCode }).text}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function IncomeExpenseReportChart({
  data,
  currencyCode,
}: {
  data: IncomeExpenseChartRow[];
  currencyCode: string;
}) {
  const { t } = useTranslation('portal');
  const safeData = Array.isArray(data)
    ? data.filter((row) =>
      row &&
      typeof row.month === 'string' &&
      row.month.length > 0 &&
      Number.isFinite(row.income) &&
      Number.isFinite(row.expenses) &&
      Number.isFinite(row.net)
    )
    : [];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={safeData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="rptIncomeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--positive)" stopOpacity={0.2} />
            <stop offset="95%" stopColor="var(--positive)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="rptExpenseGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--negative)" stopOpacity={0.15} />
            <stop offset="95%" stopColor="var(--negative)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 500 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 500 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatAxisValue(Number(value), currencyCode)} />
        <Tooltip content={<CustomTooltip currencyCode={currencyCode} t={t} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', fontWeight: 500, paddingTop: '8px' }} />
        <Area type="monotone" dataKey="income" name={t('reports.summary.totalIncome')} stroke="var(--positive)" strokeWidth={2} fill="url(#rptIncomeGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        <Area type="monotone" dataKey="expenses" name={t('reports.summary.totalExpenses')} stroke="var(--negative)" strokeWidth={2} fill="url(#rptExpenseGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
