'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { FinancialPeriodFieldErrors } from '@/lib/financial-periods';
import { getBudgetPeriodOptionsForFrequency, getBrowserTimeZone, type FinancialPeriodFormValues } from '@/lib/financial-periods/profile';

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1.5 text-xs font-500 text-negative">{message}</p> : null;
}

function labelBudgetPeriod(
  value: FinancialPeriodFormValues['default_budget_period'],
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (value) {
    case 'weekly':
      return t('financialPeriods.budgetPeriods.weekly');
    case 'biweekly':
      return t('financialPeriods.budgetPeriods.biweekly');
    case 'semimonthly':
      return t('financialPeriods.budgetPeriods.semimonthly');
    case 'custom':
      return t('financialPeriods.budgetPeriods.custom');
    case 'monthly':
    default:
      return t('financialPeriods.budgetPeriods.monthly');
  }
}

function labelWeekStart(
  value: FinancialPeriodFormValues['week_starts_on'],
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (value) {
    case 'sunday':
      return t('financialPeriods.weekdays.sunday');
    case 'saturday':
      return t('financialPeriods.weekdays.saturday');
    case 'custom':
      return t('financialPeriods.preferences.customDay');
    case 'monday':
    default:
      return t('financialPeriods.weekdays.monday');
  }
}

function translateFinancialPeriodError(
  message: string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (!message) return undefined;

  switch (message) {
    case 'Enter a valid IANA timezone such as Europe/London or Asia/Dubai.':
      return t('financialPeriods.validation.timezone');
    case 'Custom week start must be a day index from 0 to 6.':
      return t('financialPeriods.validation.customWeekStartDay');
    case 'Irregular income uses current month as the dashboard default.':
      return t('financialPeriods.validation.irregularDashboardPeriod');
    default:
      return message;
  }
}

export default function PlanningPreferencesFields({
  values,
  errors,
  onChange,
  showCompatibilityNote = false,
}: {
  values: FinancialPeriodFormValues;
  errors: FinancialPeriodFieldErrors;
  onChange: <K extends keyof FinancialPeriodFormValues>(field: K, value: FinancialPeriodFormValues[K]) => void;
  showCompatibilityNote?: boolean;
}) {
  const { t } = useTranslation('portal');
  const browserTimeZone = getBrowserTimeZone();
  const budgetOptions = useMemo(
    () => getBudgetPeriodOptionsForFrequency(values.income_frequency),
    [values.income_frequency]
  );

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-700 text-foreground">{t('financialPeriods.preferences.dashboardTitle')}</h3>
        <p className="text-sm text-muted-foreground">{t('financialPeriods.preferences.dashboardDescription')}</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {([
            { value: 'pay_cycle', label: t('financialPeriods.preferences.dashboardOptions.payCycle'), disabled: values.income_frequency === 'irregular' },
            { value: 'month', label: t('financialPeriods.preferences.dashboardOptions.month'), disabled: false },
          ] as const).map((option) => {
            const selected = values.default_dashboard_period === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => !option.disabled && onChange('default_dashboard_period', option.value)}
                disabled={option.disabled}
                className={`rounded-2xl border px-4 py-3 text-sm font-600 transition-colors ${
                  selected
                    ? 'border-accent bg-accent/5 text-foreground'
                    : 'border-border text-muted-foreground hover:border-accent/40'
                } disabled:cursor-not-allowed disabled:opacity-50`}
                aria-pressed={selected}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <FieldError message={translateFinancialPeriodError(errors.defaultDashboardPeriod, t)} />
      </div>

      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">{t('financialPeriods.preferences.defaultBudgetPeriod')}</label>
        <select
          className="input-base"
          value={values.default_budget_period}
          onChange={(event) => onChange('default_budget_period', event.target.value as FinancialPeriodFormValues['default_budget_period'])}
        >
          {budgetOptions.map((option) => (
            <option key={option} value={option}>{labelBudgetPeriod(option, t)}</option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t('financialPeriods.preferences.defaultBudgetPeriodHelp')}
        </p>
        <FieldError message={translateFinancialPeriodError(errors.defaultBudgetPeriod, t)} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">{t('financialPeriods.preferences.weekStartsOn')}</label>
          <select
            className="input-base"
            value={values.week_starts_on}
            onChange={(event) => onChange('week_starts_on', event.target.value as FinancialPeriodFormValues['week_starts_on'])}
          >
            {(['monday', 'sunday', 'saturday', 'custom'] as const).map((option) => (
              <option key={option} value={option}>{labelWeekStart(option, t)}</option>
            ))}
          </select>
          <FieldError message={translateFinancialPeriodError(errors.weekStartsOn, t)} />
        </div>
        {values.week_starts_on === 'custom' ? (
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">{t('financialPeriods.preferences.customWeekStartDayIndex')}</label>
            <input
              type="number"
              min="0"
              max="6"
              className={`input-base ${errors.weekStartsOnCustomDay ? 'input-error' : ''}`}
              value={values.week_starts_on_custom_day}
              onChange={(event) => onChange('week_starts_on_custom_day', event.target.value)}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">{t('financialPeriods.preferences.customWeekStartDayHelp')}</p>
            <FieldError message={translateFinancialPeriodError(errors.weekStartsOnCustomDay, t)} />
          </div>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">{t('financialPeriods.preferences.timezone')}</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            className={`input-base ${errors.timezone ? 'input-error' : ''}`}
            value={values.timezone}
            onChange={(event) => onChange('timezone', event.target.value)}
            placeholder={t('financialPeriods.preferences.timezonePlaceholder')}
            list="smartpocket-timezone-suggestions"
          />
          <button
            type="button"
            className="btn-secondary shrink-0"
            onClick={() => onChange('timezone', browserTimeZone)}
          >
            {t('financialPeriods.preferences.useBrowserTimezone')}
          </button>
        </div>
        <datalist id="smartpocket-timezone-suggestions">
          {(typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
            ? (Intl as typeof Intl & { supportedValuesOf: (key: 'timeZone') => string[] }).supportedValuesOf('timeZone').slice(0, 200)
            : ['UTC', 'Europe/London', 'Asia/Dubai', 'America/New_York']
          ).map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t('financialPeriods.preferences.recommendedBrowserTimezone', { timezone: browserTimeZone })}
        </p>
        <FieldError message={translateFinancialPeriodError(errors.timezone, t)} />
      </div>

      {showCompatibilityNote ? (
        <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          {t('financialPeriods.preferences.compatibilityNote')}
        </div>
      ) : null}
    </div>
  );
}
