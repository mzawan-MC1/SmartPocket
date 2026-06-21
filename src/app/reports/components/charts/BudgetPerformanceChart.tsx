'use client';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ResponsiveContainer,  } from 'recharts';
import { formatCurrencyValue } from '@/lib/currency-formatting';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';

type BudgetPerformanceChartRow = {
  id: string;
  category: string;
  allocated: number;
  spent: number;
  color: string;
};

function formatAxisValue(value: number, currencyCode: string) {
  return formatCurrencyValue(value, {
    currencyCode,
    compact: true,
  }).text;
}

function CustomTooltip({ active, payload, label, currencyCode, t }: any) {
  if (!active || !payload?.length) return null;
  const allocated = payload.find((p: any) => p.name === 'allocated')?.value || 0;
  const spent = payload.find((p: any) => p.name === 'spent')?.value || 0;
  const pct = allocated > 0 ? ((spent / allocated) * 100).toFixed(0) : 0;
  return (
    <div className="card-elevated-md p-3 min-w-[160px]">
      <p className="text-xs font-600 text-foreground mb-2">{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-xs text-muted-foreground">{t('reports.chartLabels.allocated')}</span>
          <FormattedCurrencyAmount
            amount={allocated}
            currencyCode={currencyCode}
            size="sm"
            className="text-xs font-700 font-tabular"
          />
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-xs text-muted-foreground">{t('budgets.spent')}</span>
          <FormattedCurrencyAmount
            amount={spent}
            currencyCode={currencyCode}
            size="sm"
            className={`text-xs font-700 font-tabular ${spent > allocated ? 'text-negative' : 'text-foreground'}`}
          />
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t border-border">
          <span className="text-xs text-muted-foreground">{t('reports.chartLabels.usage')}</span>
          <span className={`text-xs font-700 ${Number(pct) >= 100 ? 'text-negative' : Number(pct) >= 80 ? 'text-warning' : 'text-positive'}`}>
            {pct}%
          </span>
        </div>
      </div>
    </div>
  );
}

export default function BudgetPerformanceChart({
  data,
  currencyCode,
}: {
  data: BudgetPerformanceChartRow[];
  currencyCode: string;
}) {
  const { t } = useTranslation('portal');
  const safeData = Array.isArray(data)
    ? data.filter((row) =>
      row &&
      typeof row.id === 'string' &&
      row.id.length > 0 &&
      typeof row.category === 'string' &&
      row.category.length > 0 &&
      Number.isFinite(row.allocated) &&
      Number.isFinite(row.spent) &&
      typeof row.color === 'string' &&
      row.color.length > 0
    )
    : [];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={safeData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="category" tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontWeight: 500 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 500 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatAxisValue(Number(value), currencyCode)} />
        <Tooltip content={<CustomTooltip currencyCode={currencyCode} t={t} />} cursor={{ fill: 'var(--muted)', opacity: 0.3 }} />
        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: '11px', fontWeight: 500, paddingTop: '8px' }} />
        <Bar dataKey="allocated" fill="var(--muted)" radius={[3, 3, 0, 0]} barSize={18} name={t('reports.chartLabels.allocated')}>
        </Bar>
        <Bar dataKey="spent" radius={[3, 3, 0, 0]} barSize={18} name={t('budgets.spent')}>
          {safeData.map((entry) => {
            const pct = entry.allocated > 0 ? (entry.spent / entry.allocated) * 100 : 0;
            const color = pct >= 100 ? 'var(--negative)' : pct >= 80 ? 'var(--warning)' : entry.color || 'var(--positive)';
            return <Cell key={entry.id} fill={color} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
