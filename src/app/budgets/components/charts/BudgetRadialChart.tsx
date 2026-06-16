'use client';
import React from 'react';
import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts';

interface BudgetRadialChartProps {
  pct: number;
  spent: number;
  budget: number;
}

export default function BudgetRadialChart({ pct, spent, budget }: BudgetRadialChartProps) {
  const color = pct >= 90 ? 'var(--negative)' : pct >= 70 ? 'var(--warning)' : 'var(--positive)';

  const data = [
    { name: 'budget', value: 100, fill: 'var(--muted)' },
    { name: 'spent', value: Math.min(pct, 100), fill: color },
  ];

  return (
    <div className="relative w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="65%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
          data={data}
          barSize={12}
        >
          <RadialBar dataKey="value" cornerRadius={6} background={false} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-800 font-tabular text-foreground">{Math.round(pct)}%</span>
        <span className="text-[10px] font-600 text-muted-foreground uppercase tracking-wider">used</span>
      </div>
    </div>
  );
}