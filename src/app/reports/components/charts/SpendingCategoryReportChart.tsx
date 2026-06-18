'use client';
import React from 'react';
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

type SpendingCategoryChartRow = {
  id: string;
  category: string;
  amount: number;
  color: string;
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
    <div className="card-elevated-md p-3">
      <p className="text-xs font-600 text-foreground">{label}</p>
      <p className="text-sm font-700 font-tabular text-foreground mt-0.5">
        {formatCurrencyValue(payload[0].value, { currencyCode }).text}
      </p>
      <p className="text-xs text-muted-foreground">Reporting currency total</p>
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
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barSize={32}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="category" tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 500 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 500 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatAxisValue(Number(value), currencyCode)} />
        <Tooltip content={<CustomTooltip currencyCode={currencyCode} />} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
        <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.id} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
