'use client';

import React, { useMemo } from 'react';
import type { FinancialPeriodFieldErrors } from '@/lib/financial-periods';
import { getBudgetPeriodOptionsForFrequency, getBrowserTimeZone, type FinancialPeriodFormValues } from '@/lib/financial-periods/profile';

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1.5 text-xs font-500 text-negative">{message}</p> : null;
}

function labelBudgetPeriod(value: FinancialPeriodFormValues['default_budget_period']) {
  switch (value) {
    case 'weekly':
      return 'Weekly';
    case 'biweekly':
      return 'Every 2 weeks';
    case 'semimonthly':
      return 'Twice a month';
    case 'custom':
      return 'Custom cycle';
    case 'monthly':
    default:
      return 'Monthly';
  }
}

function labelWeekStart(value: FinancialPeriodFormValues['week_starts_on']) {
  switch (value) {
    case 'sunday':
      return 'Sunday';
    case 'saturday':
      return 'Saturday';
    case 'custom':
      return 'Custom day';
    case 'monday':
    default:
      return 'Monday';
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
  const browserTimeZone = getBrowserTimeZone();
  const budgetOptions = useMemo(
    () => getBudgetPeriodOptionsForFrequency(values.income_frequency),
    [values.income_frequency]
  );

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-700 text-foreground">How would you like your dashboard to open?</h3>
        <p className="text-sm text-muted-foreground">This sets the default view for new dashboard sessions.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {([
            { value: 'pay_cycle', label: 'Current pay period', disabled: values.income_frequency === 'irregular' },
            { value: 'month', label: 'Current month', disabled: false },
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
        <FieldError message={errors.defaultDashboardPeriod} />
      </div>

      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">Default period for new budgets</label>
        <select
          className="input-base"
          value={values.default_budget_period}
          onChange={(event) => onChange('default_budget_period', event.target.value as FinancialPeriodFormValues['default_budget_period'])}
        >
          {budgetOptions.map((option) => (
            <option key={option} value={option}>{labelBudgetPeriod(option)}</option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-muted-foreground">
          This only sets the default for new budgets. Each budget can be changed separately.
        </p>
        <FieldError message={errors.defaultBudgetPeriod} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Week starts on</label>
          <select
            className="input-base"
            value={values.week_starts_on}
            onChange={(event) => onChange('week_starts_on', event.target.value as FinancialPeriodFormValues['week_starts_on'])}
          >
            {(['monday', 'sunday', 'saturday', 'custom'] as const).map((option) => (
              <option key={option} value={option}>{labelWeekStart(option)}</option>
            ))}
          </select>
          <FieldError message={errors.weekStartsOn} />
        </div>
        {values.week_starts_on === 'custom' ? (
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Custom week start day index</label>
            <input
              type="number"
              min="0"
              max="6"
              className={`input-base ${errors.weekStartsOnCustomDay ? 'input-error' : ''}`}
              value={values.week_starts_on_custom_day}
              onChange={(event) => onChange('week_starts_on_custom_day', event.target.value)}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">Use 0 for Sunday through 6 for Saturday.</p>
            <FieldError message={errors.weekStartsOnCustomDay} />
          </div>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">Timezone</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            className={`input-base ${errors.timezone ? 'input-error' : ''}`}
            value={values.timezone}
            onChange={(event) => onChange('timezone', event.target.value)}
            placeholder="e.g. Europe/London"
            list="smartpocket-timezone-suggestions"
          />
          <button
            type="button"
            className="btn-secondary shrink-0"
            onClick={() => onChange('timezone', browserTimeZone)}
          >
            Use browser timezone
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
          Recommended for this browser: {browserTimeZone}
        </p>
        <FieldError message={errors.timezone} />
      </div>

      {showCompatibilityNote ? (
        <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          This changes your default planning view. Existing transactions, recurring schedules and budgets will not be modified.
        </div>
      ) : null}
    </div>
  );
}
