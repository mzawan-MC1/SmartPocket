'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('portal');
  const [activeTab, setActiveTab] = useState<'trend' | 'category'>('trend');
  const description = activePeriod.mode === 'month'
    ? t('dashboardCharts.descriptionThrough', { period: activePeriod.label })
    : t('dashboardCharts.descriptionDuring', { period: activePeriod.label });

  return (
    <SectionCard
      title={t('dashboardCharts.title')}
      description={description}
      className="h-full"
      bodyClassName="pt-3"
      action={
        <Tabs
          items={[
            { id: 'trend', label: t('dashboardCharts.tabs.trend') },
            { id: 'category', label: t('dashboardCharts.tabs.category') },
          ]}
          activeId={activeTab}
          onChange={setActiveTab}
        />
      }
    >
      {hasConfigurationWarning ? (
        <div className="mb-3 rounded-2xl border border-warning/30 bg-warning-soft/40 px-3 py-2 text-xs text-warning">
          {t('dashboardCharts.warning')}
        </div>
      ) : null}
      <div className="h-[248px]">
        {activeTab === 'trend' ? <IncomeExpenseChart activePeriod={activePeriod} /> : <SpendingCategoryChart activePeriod={activePeriod} />}
      </div>
    </SectionCard>
  );
}
