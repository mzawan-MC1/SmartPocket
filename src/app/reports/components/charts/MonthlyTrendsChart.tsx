'use client';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrencyValue } from '@/lib/currency-formatting';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useLanguage } from '@/contexts/LanguageContext';

type MonthlyTrendsChartRow = {
  month: string;
  income: number;
  expenses: number;
  savings: number;
};

function formatAxisValue(value: number, currencyCode: string) {
  return formatCurrencyValue(value, {
    currencyCode,
    compact: true,
  }).text;
}

function CustomTooltip({ active, payload, label, currencyCode }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card-elevated-md p-3 min-w-[160px]">
      <p className="text-xs font-600 text-muted-foreground mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={`mt-tt-${entry.name}`} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: entry.color }} />
            <span className="text-xs text-muted-foreground">{entry.name}</span>
          </div>
          <FormattedCurrencyAmount
            amount={entry.value}
            currencyCode={currencyCode}
            size="sm"
            className="text-xs font-700 font-tabular"
          />
        </div>
      ))}
    </div>
  );
}

export default function MonthlyTrendsChart({
  data,
  currencyCode,
}: {
  data: MonthlyTrendsChartRow[];
  currencyCode: string;
}) {
  const { t } = useTranslation('portal');
  const { language } = useLanguage();
  const isArabic = language === 'ar';
  const safeData = Array.isArray(data)
    ? data.filter((row) =>
      row &&
      typeof row.month === 'string' &&
      row.month.length > 0 &&
      Number.isFinite(row.income) &&
      Number.isFinite(row.expenses) &&
      Number.isFinite(row.savings)
    )
    : [];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={safeData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barGap={3}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" minTickGap={isArabic ? 18 : 12} tick={{ fontSize: isArabic ? 12 : 11, fill: 'var(--muted-foreground)', fontWeight: 500 }} axisLine={false} tickLine={false} />
        <YAxis width={isArabic ? 52 : 46} tick={{ fontSize: isArabic ? 12 : 11, fill: 'var(--muted-foreground)', fontWeight: 500 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatAxisValue(Number(value), currencyCode)} />
        <Tooltip content={<CustomTooltip currencyCode={currencyCode} />} cursor={{ fill: 'var(--muted)', opacity: 0.3 }} />
        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: isArabic ? '12px' : '11px', fontWeight: 500, paddingTop: '8px' }} />
        <Bar dataKey="income" name={t('reports.summary.totalIncome')} fill="var(--positive)" radius={[3, 3, 0, 0]} barSize={20} />
        <Bar dataKey="expenses" name={t('reports.summary.totalExpenses')} fill="var(--negative)" radius={[3, 3, 0, 0]} barSize={20} />
        <Bar dataKey="savings" name={t('reports.summary.netSavings')} fill="var(--accent)" radius={[3, 3, 0, 0]} barSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}
