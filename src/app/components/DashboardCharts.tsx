'use client';
import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import SectionCard from '@/components/ui/SectionCard';
import Tabs from '@/components/ui/Tabs';
import type { DashboardActivePeriod } from '@/lib/finance';

const IncomeExpenseChart = dynamic(() => import('./charts/IncomeExpenseChart'), { ssr: false });
const SpendingCategoryChart = dynamic(() => import('./charts/SpendingCategoryChart'), { ssr: false });

export default function DashboardCharts({
  activePeriod,
  hasConfigurationWarning = false,
}: {
  activePeriod: DashboardActivePeriod;
  hasConfigurationWarning?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<'trend' | 'category'>('trend');
  const description = activePeriod.mode === 'month'
    ? `Income, expenses, and spending composition through ${activePeriod.label}.`
    : `Income, expenses, and spending composition during ${activePeriod.label}.`;

  return (
    <SectionCard
      title="Financial Overview"
      description={description}
      className="h-full"
      bodyClassName="pt-3"
      action={
        <Tabs
          items={[
            { id: 'trend', label: 'Income vs Expenses' },
            { id: 'category', label: 'By Category' },
          ]}
          activeId={activeTab}
          onChange={setActiveTab}
        />
      }
    >
      {hasConfigurationWarning ? (
        <div className="mb-3 rounded-2xl border border-warning/30 bg-warning-soft/40 px-3 py-2 text-xs text-warning">
          Pay-period charts are using a monthly fallback until your income schedule is completed in Settings.
        </div>
      ) : null}
      <div className="h-[248px]">
        {activeTab === 'trend' ? <IncomeExpenseChart activePeriod={activePeriod} /> : <SpendingCategoryChart activePeriod={activePeriod} />}
      </div>
    </SectionCard>
  );
}
