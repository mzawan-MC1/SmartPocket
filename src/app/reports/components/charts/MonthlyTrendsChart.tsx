'use client';
import React from 'react';
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

// Backend integration point: fetch from /api/reports/monthly-trends
const data = [
  { month: 'Jan', income: 6800, expenses: 4200, savings: 2600 },
  { month: 'Feb', income: 7100, expenses: 5100, savings: 2000 },
  { month: 'Mar', income: 6900, expenses: 3980, savings: 2920 },
  { month: 'Apr', income: 7200, expenses: 4650, savings: 2550 },
  { month: 'May', income: 7000, expenses: 5380, savings: 1620 },
  { month: 'Jun', income: 7300, expenses: 5140, savings: 2160 },
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card-elevated-md p-3 min-w-[160px]">
      <p className="text-xs font-600 text-muted-foreground mb-2">{label} 2026</p>
      {payload.map((entry: any) => (
        <div key={`mt-tt-${entry.name}`} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: entry.color }} />
            <span className="text-xs text-muted-foreground capitalize">{entry.name}</span>
          </div>
          <span className="text-xs font-700 font-tabular">${entry.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export default function MonthlyTrendsChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barGap={3}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 500 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 500 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.3 }} />
        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: '11px', fontWeight: 500, paddingTop: '8px' }} />
        <Bar dataKey="income" fill="var(--positive)" radius={[3, 3, 0, 0]} barSize={20} />
        <Bar dataKey="expenses" fill="var(--negative)" radius={[3, 3, 0, 0]} barSize={20} />
        <Bar dataKey="savings" fill="var(--accent)" radius={[3, 3, 0, 0]} barSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}