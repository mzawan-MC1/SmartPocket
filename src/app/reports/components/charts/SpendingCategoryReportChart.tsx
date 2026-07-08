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
  Cell,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrencyValue } from '@/lib/currency-formatting';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useLanguage } from '@/contexts/LanguageContext';

type SpendingCategoryChartRow = {
  id: string;
  category: string;
  amount: number;
  color: string;
};

function formatCategoryAxisLabel(value: string) {
  return value.length > 14 ? `${value.slice(0, 14)}…` : value;
}

function formatAxisValue(value: number, currencyCode: string) {
  return formatCurrencyValue(value, {
    currencyCode,
    compact: true,
  }).text;
}

function CustomTooltip({ active, payload, label, currencyCode, t }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card-elevated-md p-3">
      <p className="text-xs font-600 text-foreground">{label}</p>
      <FormattedCurrencyAmount
        amount={payload[0].value}
        currencyCode={currencyCode}
        size="sm"
        className="mt-0.5 text-sm font-700 font-tabular text-foreground"
      />
      <p className="text-xs text-muted-foreground">{t('reports.chartLabels.reportingCurrencyTotal')}</p>
    </div>
  );
}

export default function SpendingCategoryReportChart({
  data,
  currencyCode,
}: {
  data: SpendingCategoryChartRow[];
  currencyCode: string;
}) {
  const { t } = useTranslation('portal');
  const { language } = useLanguage();
  const isArabic = language === 'ar';
  const safeData = Array.isArray(data)
    ? data.filter((row) =>
      row &&
      typeof row.id === 'string' &&
      row.id.length > 0 &&
      typeof row.category === 'string' &&
      row.category.length > 0 &&
      Number.isFinite(row.amount) &&
      typeof row.color === 'string' &&
      row.color.length > 0
    )
    : [];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={safeData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barSize={32}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="category" interval={0} minTickGap={isArabic ? 18 : 12} tickFormatter={formatCategoryAxisLabel} tick={{ fontSize: isArabic ? 12 : 11, fill: 'var(--muted-foreground)', fontWeight: 500 }} axisLine={false} tickLine={false} />
        <YAxis width={isArabic ? 52 : 46} tick={{ fontSize: isArabic ? 12 : 11, fill: 'var(--muted-foreground)', fontWeight: 500 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatAxisValue(Number(value), currencyCode)} />
        <Tooltip content={<CustomTooltip currencyCode={currencyCode} t={t} />} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
        <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
          {safeData.map((entry) => (
            <Cell key={entry.id} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
