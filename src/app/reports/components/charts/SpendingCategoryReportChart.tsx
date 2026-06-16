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

// Backend integration point: fetch from /api/reports/spending-by-category
const data = [
  { id: 'rsc-housing', category: 'Housing', amount: 8700, color: '#7c3aed' },
  { id: 'rsc-food', category: 'Food', amount: 4963, color: '#f97316' },
  { id: 'rsc-transport', category: 'Transport', amount: 2280, color: '#2563eb' },
  { id: 'rsc-shopping', category: 'Shopping', amount: 2245, color: '#d97706' },
  { id: 'rsc-utilities', category: 'Utilities', amount: 1140, color: '#8b5cf6' },
  { id: 'rsc-health', category: 'Healthcare', amount: 900, color: '#ec4899' },
  { id: 'rsc-entertainment', category: 'Entertain.', amount: 1410, color: '#dc2626' },
  { id: 'rsc-other', category: 'Other', amount: 812, color: '#94a3b8' },
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card-elevated-md p-3">
      <p className="text-xs font-600 text-foreground">{label}</p>
      <p className="text-sm font-700 font-tabular text-foreground mt-0.5">
        ${payload[0].value.toLocaleString()}
      </p>
      <p className="text-xs text-muted-foreground">Jan–Jun 2026</p>
    </div>
  );
}

export default function SpendingCategoryReportChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barSize={32}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="category" tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 500 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 500 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
        <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.id} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}