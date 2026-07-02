'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { FinancialPeriodFieldErrors, MonthlyPaydayRule, WeekStartsOn, WeeklyPayday } from '@/lib/financial-periods';
import type { FinancialPeriodFormValues } from '@/lib/financial-periods/profile';

function FieldError({ message }: { message?: string }) {
  return message ? <p role="alert" className="mt-1.5 text-xs font-500 text-negative">{message}</p> : null;
}

function translateFinancialPeriodError(
  message: string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (!message) return undefined;

  switch (message) {
    case 'Weekly schedules need a recent or upcoming payday anchor date.':
      return t('financialPeriods.validation.weeklyAnchorDate');
    case 'Every 2 weeks schedules need one recent or upcoming payday anchor date.':
      return t('financialPeriods.validation.biweeklyAnchorDate');
    case 'Custom schedules need an anchor date.':
      return t('financialPeriods.validation.customAnchorDate');
    case 'Choose the first semimonthly payday.':
      return t('financialPeriods.validation.semimonthlyDay1Required');
    case 'Choose the second semimonthly payday.':
      return t('financialPeriods.validation.semimonthlyDay2Required');
    case 'Semimonthly day 1 must be 1-31 or Last day of the month.':
      return t('financialPeriods.validation.semimonthlyDay1Range');
    case 'Semimonthly day 2 must be 1-31 or Last day of the month.':
      return t('financialPeriods.validation.semimonthlyDay2Range');
    case 'Twice-a-month schedules need two different payday positions.':
      return t('financialPeriods.validation.semimonthlyDifferentDays');
    case 'The second semimonthly payday must be later in the month than the first.':
      return t('financialPeriods.validation.semimonthlyDayOrder');
    case 'Choose how monthly payday should be calculated.':
      return t('financialPeriods.validation.monthlyRuleRequired');
    case 'Specific monthly payday must be a day from 1 to 31.':
      return t('financialPeriods.validation.monthlyDayRange');
    default:
      if (message.startsWith('Custom schedules must repeat every ')) {
        const match = message.match(/(\d+)-(\d+)/);
        return t('financialPeriods.validation.customCycleDays', {
          min: match?.[1] ?? '2',
          max: match?.[2] ?? '90',
        });
      }
      return message;
  }
}

export default function PayScheduleFields({
  values,
  errors,
  onChange,
  highlightAnchorRequirement = false,
  anchorIntroTitle,
  anchorIntroDescription,
  anchorContainerRef,
  anchorInputRef,
  anchorErrorId,
}: {
  values: FinancialPeriodFormValues;
  errors: FinancialPeriodFieldErrors;
  onChange: <K extends keyof FinancialPeriodFormValues>(field: K, value: FinancialPeriodFormValues[K]) => void;
  highlightAnchorRequirement?: boolean;
  anchorIntroTitle?: string;
  anchorIntroDescription?: string;
  anchorContainerRef?: React.RefObject<HTMLDivElement | null>;
  anchorInputRef?: React.RefObject<HTMLInputElement | null>;
  anchorErrorId?: string;
}) {
  const { t } = useTranslation('portal');
  const weekdayOptions: Array<{ value: WeeklyPayday; label: string }> = [
    { value: 'monday', label: t('financialPeriods.weekdays.monday') },
    { value: 'tuesday', label: t('financialPeriods.weekdays.tuesday') },
    { value: 'wednesday', label: t('financialPeriods.weekdays.wednesday') },
    { value: 'thursday', label: t('financialPeriods.weekdays.thursday') },
    { value: 'friday', label: t('financialPeriods.weekdays.friday') },
    { value: 'saturday', label: t('financialPeriods.weekdays.saturday') },
    { value: 'sunday', label: t('financialPeriods.weekdays.sunday') },
  ];
  const monthlyRuleOptions: Array<{ value: MonthlyPaydayRule; label: string }> = [
    { value: 'specific_day', label: t('financialPeriods.paySchedule.monthlyRules.specificDay') },
    { value: 'last_day', label: t('financialPeriods.paySchedule.monthlyRules.lastDay') },
    { value: 'last_working_day', label: t('financialPeriods.paySchedule.monthlyRules.lastWorkingDay') },
  ];
  const semimonthlyOptions = [
    ...Array.from({ length: 31 }, (_, index) => {
      const day = index + 1;
      return { value: String(day), label: `${day}` };
    }),
    { value: '0', label: t('financialPeriods.paySchedule.lastDayOfMonth') },
  ];
  const anchorFieldDescriptionId = anchorErrorId ? `${anchorErrorId}-description` : undefined;
  const anchorFieldHelpIds = [anchorFieldDescriptionId, anchorErrorId].filter(Boolean).join(' ') || undefined;
  const anchorCardClassName = highlightAnchorRequirement
    ? 'rounded-2xl border border-accent/20 bg-accent/5 p-4'
    : '';

  return (
    <div className="space-y-4">
      {values.income_frequency === 'weekly' && (
        <div ref={anchorContainerRef} className={anchorCardClassName}>
          {highlightAnchorRequirement && (anchorIntroTitle || anchorIntroDescription) ? (
            <div className="mb-3 space-y-1">
              {anchorIntroTitle ? <p className="text-sm font-700 text-foreground">{anchorIntroTitle}</p> : null}
              {anchorIntroDescription ? <p className="text-xs text-muted-foreground">{anchorIntroDescription}</p> : null}
            </div>
          ) : null}
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">{t('financialPeriods.paySchedule.weekly.anchorDate')}</label>
            <input
              ref={anchorInputRef}
              type="date"
              className={`input-base ${errors.payCycleAnchorDate ? 'input-error' : ''}`}
              value={values.pay_cycle_anchor_date}
              onChange={(event) => onChange('pay_cycle_anchor_date', event.target.value)}
              aria-invalid={errors.payCycleAnchorDate ? 'true' : 'false'}
              aria-describedby={anchorFieldHelpIds}
            />
            <p id={anchorFieldDescriptionId} className="mt-1.5 text-xs text-muted-foreground">{t('financialPeriods.paySchedule.weekly.anchorDateHelp')}</p>
            <div id={anchorErrorId}>
              <FieldError message={translateFinancialPeriodError(errors.payCycleAnchorDate, t)} />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-600 text-foreground mb-1.5">{t('financialPeriods.paySchedule.weekly.weekdayFallback')}</label>
            <select
              className={`input-base ${errors.weeklyPayday ? 'input-error' : ''}`}
              value={values.weekly_payday}
              onChange={(event) => onChange('weekly_payday', event.target.value as FinancialPeriodFormValues['weekly_payday'])}
            >
              <option value="">{t('financialPeriods.paySchedule.weekly.useAnchorOnly')}</option>
              {weekdayOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-muted-foreground">{t('financialPeriods.paySchedule.weekly.weekdayFallbackHelp')}</p>
            <FieldError message={translateFinancialPeriodError(errors.weeklyPayday, t)} />
          </div>
        </div>
      )}

      {values.income_frequency === 'biweekly' && (
        <div ref={anchorContainerRef} className={anchorCardClassName}>
          {highlightAnchorRequirement && (anchorIntroTitle || anchorIntroDescription) ? (
            <div className="mb-3 space-y-1">
              {anchorIntroTitle ? <p className="text-sm font-700 text-foreground">{anchorIntroTitle}</p> : null}
              {anchorIntroDescription ? <p className="text-xs text-muted-foreground">{anchorIntroDescription}</p> : null}
            </div>
          ) : null}
          <label className="block text-sm font-600 text-foreground mb-1.5">{t('financialPeriods.paySchedule.biweekly.anchorDate')}</label>
          <input
            ref={anchorInputRef}
            type="date"
            className={`input-base ${errors.payCycleAnchorDate ? 'input-error' : ''}`}
            value={values.pay_cycle_anchor_date}
            onChange={(event) => onChange('pay_cycle_anchor_date', event.target.value)}
            aria-invalid={errors.payCycleAnchorDate ? 'true' : 'false'}
            aria-describedby={anchorFieldHelpIds}
          />
          <p id={anchorFieldDescriptionId} className="mt-1.5 text-xs text-muted-foreground">{t('financialPeriods.paySchedule.biweekly.anchorDateHelp')}</p>
          <div id={anchorErrorId}>
            <FieldError message={translateFinancialPeriodError(errors.payCycleAnchorDate, t)} />
          </div>
        </div>
      )}

      {values.income_frequency === 'semimonthly' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">{t('financialPeriods.paySchedule.semimonthly.firstPayday')}</label>
            <select
              className={`input-base ${errors.semimonthlyDay1 ? 'input-error' : ''}`}
              value={values.semimonthly_day_1}
              onChange={(event) => onChange('semimonthly_day_1', event.target.value)}
            >
              <option value="">{t('financialPeriods.paySchedule.semimonthly.chooseFirst')}</option>
              {semimonthlyOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <FieldError message={translateFinancialPeriodError(errors.semimonthlyDay1, t)} />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">{t('financialPeriods.paySchedule.semimonthly.secondPayday')}</label>
            <select
              className={`input-base ${errors.semimonthlyDay2 ? 'input-error' : ''}`}
              value={values.semimonthly_day_2}
              onChange={(event) => onChange('semimonthly_day_2', event.target.value)}
            >
              <option value="">{t('financialPeriods.paySchedule.semimonthly.chooseSecond')}</option>
              {semimonthlyOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <FieldError message={translateFinancialPeriodError(errors.semimonthlyDay2, t)} />
          </div>
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            {t('financialPeriods.paySchedule.semimonthly.help')}
          </p>
        </div>
      )}

      {values.income_frequency === 'monthly' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-600 text-foreground mb-2">{t('financialPeriods.paySchedule.monthly.title')}</label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {monthlyRuleOptions.map((option) => {
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
            <FieldError message={translateFinancialPeriodError(errors.monthlyPaydayRule, t)} />
          </div>
          {values.monthly_payday_rule === 'specific_day' && (
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">{t('financialPeriods.paySchedule.monthly.specificDayNumber')}</label>
              <input
                type="number"
                min="1"
                max="31"
                className={`input-base ${errors.monthlyPaydayDay ? 'input-error' : ''}`}
                value={values.monthly_payday_day}
                onChange={(event) => onChange('monthly_payday_day', event.target.value)}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">{t('financialPeriods.paySchedule.monthly.specificDayHelp')}</p>
              <FieldError message={translateFinancialPeriodError(errors.monthlyPaydayDay, t)} />
            </div>
          )}
        </div>
      )}

      {values.income_frequency === 'irregular' && (
        <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          {t('financialPeriods.paySchedule.irregularNote')}
        </div>
      )}

      {values.income_frequency === 'custom' && (
        <div ref={anchorContainerRef} className={`${anchorCardClassName} grid grid-cols-1 gap-4 sm:grid-cols-2`}>
          {highlightAnchorRequirement && (anchorIntroTitle || anchorIntroDescription) ? (
            <div className="space-y-1 sm:col-span-2">
              {anchorIntroTitle ? <p className="text-sm font-700 text-foreground">{anchorIntroTitle}</p> : null}
              {anchorIntroDescription ? <p className="text-xs text-muted-foreground">{anchorIntroDescription}</p> : null}
            </div>
          ) : null}
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">{t('financialPeriods.paySchedule.custom.anchorDate')}</label>
            <input
              ref={anchorInputRef}
              type="date"
              className={`input-base ${errors.payCycleAnchorDate ? 'input-error' : ''}`}
              value={values.pay_cycle_anchor_date}
              onChange={(event) => onChange('pay_cycle_anchor_date', event.target.value)}
              aria-invalid={errors.payCycleAnchorDate ? 'true' : 'false'}
              aria-describedby={anchorFieldHelpIds}
            />
            <p id={anchorFieldDescriptionId} className="mt-1.5 text-xs text-muted-foreground">
              {anchorIntroDescription || t('financialPeriods.paySchedule.custom.anchorDate')}
            </p>
            <div id={anchorErrorId}>
              <FieldError message={translateFinancialPeriodError(errors.payCycleAnchorDate, t)} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">{t('financialPeriods.paySchedule.custom.daysPerCycle')}</label>
            <input
              type="number"
              min="2"
              max="90"
              className={`input-base ${errors.customCycleDays ? 'input-error' : ''}`}
              value={values.custom_cycle_days}
              onChange={(event) => onChange('custom_cycle_days', event.target.value)}
            />
            <FieldError message={translateFinancialPeriodError(errors.customCycleDays, t)} />
          </div>
        </div>
      )}
    </div>
  );
}
