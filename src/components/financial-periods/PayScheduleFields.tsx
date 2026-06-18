'use client';

import React from 'react';
import type { FinancialPeriodFieldErrors, MonthlyPaydayRule, WeekStartsOn, WeeklyPayday } from '@/lib/financial-periods';
import type { FinancialPeriodFormValues } from '@/lib/financial-periods/profile';

const WEEKDAY_OPTIONS: Array<{ value: WeeklyPayday; label: string }> = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

const MONTHLY_RULE_OPTIONS: Array<{ value: MonthlyPaydayRule; label: string }> = [
  { value: 'specific_day', label: 'Specific day' },
  { value: 'last_day', label: 'Last day of the month' },
  { value: 'last_working_day', label: 'Last working day' },
];

const SEMIMONTHLY_OPTIONS = [
  ...Array.from({ length: 31 }, (_, index) => {
    const day = index + 1;
    return { value: String(day), label: `${day}` };
  }),
  { value: '0', label: 'Last day of the month' },
];

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1.5 text-xs font-500 text-negative">{message}</p> : null;
}

export default function PayScheduleFields({
  values,
  errors,
  onChange,
}: {
  values: FinancialPeriodFormValues;
  errors: FinancialPeriodFieldErrors;
  onChange: <K extends keyof FinancialPeriodFormValues>(field: K, value: FinancialPeriodFormValues[K]) => void;
}) {
  return (
    <div className="space-y-4">
      {values.income_frequency === 'weekly' && (
        <>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Select a recent or next payday</label>
            <input
              type="date"
              className={`input-base ${errors.payCycleAnchorDate ? 'input-error' : ''}`}
              value={values.pay_cycle_anchor_date}
              onChange={(event) => onChange('pay_cycle_anchor_date', event.target.value)}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">Smart Pocket uses this as the anchor for each 7-day pay cycle.</p>
            <FieldError message={errors.payCycleAnchorDate} />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Payday weekday fallback</label>
            <select
              className={`input-base ${errors.weeklyPayday ? 'input-error' : ''}`}
              value={values.weekly_payday}
              onChange={(event) => onChange('weekly_payday', event.target.value as FinancialPeriodFormValues['weekly_payday'])}
            >
              <option value="">Use the anchor date only</option>
              {WEEKDAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-muted-foreground">Optional. This is only used if you prefer to store a weekday as well as an anchor date.</p>
            <FieldError message={errors.weeklyPayday} />
          </div>
        </>
      )}

      {values.income_frequency === 'biweekly' && (
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Select one recent or next payday</label>
          <input
            type="date"
            className={`input-base ${errors.payCycleAnchorDate ? 'input-error' : ''}`}
            value={values.pay_cycle_anchor_date}
            onChange={(event) => onChange('pay_cycle_anchor_date', event.target.value)}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">Smart Pocket uses this to calculate future 14-day pay periods.</p>
          <FieldError message={errors.payCycleAnchorDate} />
        </div>
      )}

      {values.income_frequency === 'semimonthly' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">First payday</label>
            <select
              className={`input-base ${errors.semimonthlyDay1 ? 'input-error' : ''}`}
              value={values.semimonthly_day_1}
              onChange={(event) => onChange('semimonthly_day_1', event.target.value)}
            >
              <option value="">Choose the first payday</option>
              {SEMIMONTHLY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <FieldError message={errors.semimonthlyDay1} />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Second payday</label>
            <select
              className={`input-base ${errors.semimonthlyDay2 ? 'input-error' : ''}`}
              value={values.semimonthly_day_2}
              onChange={(event) => onChange('semimonthly_day_2', event.target.value)}
            >
              <option value="">Choose the second payday</option>
              {SEMIMONTHLY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <FieldError message={errors.semimonthlyDay2} />
          </div>
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            Smart Pocket treats each pay period as starting on a payday and ending one day before the next payday.
          </p>
        </div>
      )}

      {values.income_frequency === 'monthly' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-600 text-foreground mb-2">Monthly payday rule</label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {MONTHLY_RULE_OPTIONS.map((option) => {
                const selected = values.monthly_payday_rule === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange('monthly_payday_rule', option.value)}
                    className={`rounded-2xl border px-4 py-3 text-sm font-600 transition-colors ${
                      selected
                        ? 'border-accent bg-accent/5 text-foreground'
                        : 'border-border text-muted-foreground hover:border-accent/40'
                    }`}
                    aria-pressed={selected}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <FieldError message={errors.monthlyPaydayRule} />
          </div>
          {values.monthly_payday_rule === 'specific_day' && (
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Specific day number</label>
              <input
                type="number"
                min="1"
                max="31"
                className={`input-base ${errors.monthlyPaydayDay ? 'input-error' : ''}`}
                value={values.monthly_payday_day}
                onChange={(event) => onChange('monthly_payday_day', event.target.value)}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">If a month is shorter, Smart Pocket safely uses that month&apos;s last day.</p>
              <FieldError message={errors.monthlyPaydayDay} />
            </div>
          )}
        </div>
      )}

      {values.income_frequency === 'irregular' && (
        <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          Smart Pocket will use monthly planning by default.
        </div>
      )}

      {values.income_frequency === 'custom' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Anchor date</label>
            <input
              type="date"
              className={`input-base ${errors.payCycleAnchorDate ? 'input-error' : ''}`}
              value={values.pay_cycle_anchor_date}
              onChange={(event) => onChange('pay_cycle_anchor_date', event.target.value)}
            />
            <FieldError message={errors.payCycleAnchorDate} />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Days in each cycle</label>
            <input
              type="number"
              min="2"
              max="90"
              className={`input-base ${errors.customCycleDays ? 'input-error' : ''}`}
              value={values.custom_cycle_days}
              onChange={(event) => onChange('custom_cycle_days', event.target.value)}
            />
            <FieldError message={errors.customCycleDays} />
          </div>
        </div>
      )}
    </div>
  );
}
