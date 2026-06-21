'use client';

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { IncomeFrequency } from '@/lib/financial-periods';

export default function IncomeFrequencySelector({
  value,
  onChange,
  error,
}: {
  value: IncomeFrequency;
  onChange: (value: IncomeFrequency) => void;
  error?: string;
}) {
  const { t } = useTranslation('portal');
  const options: Array<{
    value: IncomeFrequency;
    label: string;
    description: string;
  }> = [
    {
      value: 'weekly',
      label: t('financialPeriods.incomeFrequency.options.weekly.label'),
      description: t('financialPeriods.incomeFrequency.options.weekly.description'),
    },
    {
      value: 'biweekly',
      label: t('financialPeriods.incomeFrequency.options.biweekly.label'),
      description: t('financialPeriods.incomeFrequency.options.biweekly.description'),
    },
    {
      value: 'semimonthly',
      label: t('financialPeriods.incomeFrequency.options.semimonthly.label'),
      description: t('financialPeriods.incomeFrequency.options.semimonthly.description'),
    },
    {
      value: 'monthly',
      label: t('financialPeriods.incomeFrequency.options.monthly.label'),
      description: t('financialPeriods.incomeFrequency.options.monthly.description'),
    },
    {
      value: 'irregular',
      label: t('financialPeriods.incomeFrequency.options.irregular.label'),
      description: t('financialPeriods.incomeFrequency.options.irregular.description'),
    },
    {
      value: 'custom',
      label: t('financialPeriods.incomeFrequency.options.custom.label'),
      description: t('financialPeriods.incomeFrequency.options.custom.description'),
    },
  ];

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-700 text-foreground">{t('financialPeriods.incomeFrequency.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('financialPeriods.incomeFrequency.description')}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-2xl border p-4 text-left transition-all ${
                selected
                  ? 'border-accent bg-accent/5 shadow-card-sm'
                  : 'border-border hover:border-accent/40 hover:bg-muted/20'
              }`}
              aria-pressed={selected}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 shrink-0 ${selected ? 'text-accent' : 'text-muted-foreground'}`}>
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <p className="text-sm font-700 text-foreground">{option.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{option.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {error ? <p className="text-xs font-500 text-negative">{error}</p> : null}
    </div>
  );
}
