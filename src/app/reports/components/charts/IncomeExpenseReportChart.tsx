'use client';
import React from 'react';
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

// Backend integration point: fetch from /api/reports/income-expense-trend
const data = [
  { month: 'Jan', income: 6800, expenses: 4200 },
  { month: 'Feb', income: 7100, expenses: 5100 },
  { month: 'Mar', income: 6900, expenses: 3980 },
  { month: 'Apr', income: 7200, expenses: 4650 },
  { month: 'May', income: 7000, expenses: 5380 },
  { month: 'Jun', income: 7300, expenses: 5140 },
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card-elevated-md p-3 min-w-[150px]">
      <p className="text-xs font-600 text-muted-foreground mb-2">{label} 2026</p>
      {payload.map((entry: any) => (
        <div key={`rpt-tt-${entry.name}`} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-xs text-muted-foreground capitalize">{entry.name}</span>
          </div>
          <span className="text-xs font-700 font-tabular">${entry.value.toLocaleString()}</span>
        </div>
      ))}
      <div className="mt-1.5 pt-1.5 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Net</span>
          <span className={`text-xs font-700 font-tabular ${payload[0]?.value - payload[1]?.value >= 0 ? 'text-positive' : 'text-negative'}`}>
            ${(payload[0]?.value - payload[1]?.value).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function IncomeExpenseReportChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
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
        <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 500 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip content={<CustomTooltip />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', fontWeight: 500, paddingTop: '8px' }} />
        <Area type="monotone" dataKey="income" stroke="var(--positive)" strokeWidth={2} fill="url(#rptIncomeGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        <Area type="monotone" dataKey="expenses" stroke="var(--negative)" strokeWidth={2} fill="url(#rptExpenseGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}