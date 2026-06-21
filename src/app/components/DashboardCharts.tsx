'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from 'next/dynamic';
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
  const { t } = useTranslation('portal');
  const [activeTab, setActiveTab] = useState<'trend' | 'category'>('trend');
  const description = activePeriod.mode === 'month'
    ? t('dashboardCharts.descriptionThrough', { period: activePeriod.label })
    : t('dashboardCharts.descriptionDuring', { period: activePeriod.label });

  return (
    <section className="section-card h-full rounded-[28px] border border-border/80 bg-card shadow-card-sm">
      <div className="flex flex-col gap-3 border-b border-border/70 px-5 py-4 max-[480px]:px-4 max-[480px]:py-3.5">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-800 tracking-[-0.02em] text-foreground">{t('dashboardCharts.title')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,auto)] sm:items-center lg:w-[27rem]">
            <Tabs
              items={[
                { id: 'trend', label: t('dashboardCharts.tabs.trend') },
                { id: 'category', label: t('dashboardCharts.tabs.category') },
              ]}
              activeId={activeTab}
              onChange={setActiveTab}
              className="w-full [&_.tabs-root]:w-full [&_.tab-button]:min-h-[2.1rem] [&_.tab-button]:flex-1 [&_.tab-button]:rounded-[14px] [&_.tab-button]:px-2.5 [&_.tab-button]:py-1.5 [&_.tab-button]:text-[11px] [&_.tab-button]:font-700 [&_.tab-button]:whitespace-nowrap"
            />
            <div className="inline-flex min-w-0 items-center justify-center rounded-2xl border border-border/80 bg-card px-3 py-2 text-[11px] font-700 text-foreground shadow-card-sm sm:min-w-[11rem]">
              {activePeriod.label}
            </div>
          </div>
        </div>
      </div>
      {hasConfigurationWarning ? (
        <div className="mx-5 mt-4 rounded-2xl border border-warning/30 bg-warning-soft/40 px-3 py-2 text-xs text-warning max-[480px]:mx-4">
          {t('dashboardCharts.warning')}
        </div>
      ) : null}
      <div className="px-2 pb-2 pt-4 max-[480px]:px-1">
        <div className={activeTab === 'category' ? 'h-[300px] max-[480px]:h-[248px]' : ''}>
          {activeTab === 'trend' ? <IncomeExpenseChart activePeriod={activePeriod} /> : <SpendingCategoryChart activePeriod={activePeriod} />}
        </div>
      </div>
    </section>
  );
}
