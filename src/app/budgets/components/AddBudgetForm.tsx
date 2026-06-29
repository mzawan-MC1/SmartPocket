'use client';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { createBudget, getCategories, updateBudget, type Budget, type Category } from '@/lib/finance';
import { useEffect } from 'react';
import { toast } from 'sonner';
import CurrencySelector from '@/components/CurrencySelector';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { resolveCurrencyPreference } from '@/lib/currency-totals';
import { dispatchSmartPocketDataChanged, useSmartPocketDataChanged } from '@/lib/data-change';
import {
  getFieldErrorTextClassName,
  getFieldInputClassName,
  getFieldLabelClassName,
} from '@/lib/form-field-styles';
import { loadUserFinancialPeriodContext, type UserFinancialPeriodContext } from '@/lib/financial-periods/profile';
import { getBudgetPeriodTypeLabel, getCurrentBudgetPeriod, getDefaultBudgetAnchorDate, normalizeBudgetPeriodValue, validateBudgetPeriodConfig } from '@/lib/financial-periods/budgets';
import type { BudgetPeriod } from '@/lib/financial-periods';

interface AddBudgetFormProps {
  budget?: Budget | null;
  onSuccess: () => void;
  onCancel: () => void;
  spaceId?: string | null;
  spaceName?: string | null;
}

type BudgetFormState = {
  name: string;
  category_id: string;
  amount: string;
  currency: string;
  budget_period: BudgetPeriod;
  period_anchor_date: string;
  custom_period_days: string;
  alert_at_percent: string;
};

type BudgetFieldKey =
  | 'category_id'
  | 'amount'
  | 'currency'
  | 'budget_period'
  | 'period_anchor_date'
  | 'custom_period_days';

function buildInitialFormState(budget: Budget | null): BudgetFormState {
  return {
    name: budget?.name || '',
    category_id: budget?.category_id || '',
    amount: budget ? String(budget.amount) : '',
    currency: budget?.currency || '',
    budget_period: budget ? normalizeBudgetPeriodValue(budget) : 'monthly',
    period_anchor_date: budget?.period_anchor_date || '',
    custom_period_days: budget?.custom_period_days ? String(budget.custom_period_days) : '',
    alert_at_percent: budget?.alert_at_percent ? String(budget.alert_at_percent) : '80',
  };
}

function formatSemimonthlySchedule(
  context: UserFinancialPeriodContext | null,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  const config = context?.config;
  if (!config || config.semimonthlyDay1 === null || config.semimonthlyDay2 === null) {
    return null;
  }
  const formatDay = (value: number) => {
    if (value === 0) {
      return t('financialPeriods.paySchedule.lastDayOfMonth', { ns: 'portal' });
    }
    const mod100 = value % 100;
    if (mod100 >= 11 && mod100 <= 13) {
      return `${value}th`;
    }
    const mod10 = value % 10;
    if (mod10 === 1) return `${value}st`;
    if (mod10 === 2) return `${value}nd`;
    if (mod10 === 3) return `${value}rd`;
    return `${value}th`;
  };
  return `${formatDay(config.semimonthlyDay1)} and ${formatDay(config.semimonthlyDay2)}`;
}

function getBudgetPeriodLabel(
  period: BudgetPeriod,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (period) {
    case 'weekly':
      return t('financialPeriods.budgetPeriods.weekly', { ns: 'portal' });
    case 'biweekly':
      return t('financialPeriods.budgetPeriods.biweekly', { ns: 'portal' });
    case 'semimonthly':
      return t('financialPeriods.budgetPeriods.semimonthly', { ns: 'portal' });
    case 'custom':
      return t('financialPeriods.budgetPeriods.custom', { ns: 'portal' });
    case 'monthly':
    default:
      return t('financialPeriods.budgetPeriods.monthly', { ns: 'portal' });
  }
}

function getBudgetValidationField(message: string | null | undefined): BudgetFieldKey | null {
  switch (message) {
    case 'budgets.form.errors.semimonthlyScheduleRequired':
      return 'budget_period';
    case 'budgets.form.errors.biweeklyAnchorRequired':
    case 'budgets.form.errors.customAnchorRequired':
    case 'Weekly schedules need a recent or upcoming payday anchor date.':
    case 'Every 2 weeks schedules need one recent or upcoming payday anchor date.':
    case 'Custom schedules need an anchor date.':
      return 'period_anchor_date';
    case 'budgets.form.errors.customCycleLengthInvalid':
      return 'custom_period_days';
    default:
      if (message?.startsWith('Custom schedules must repeat every ')) {
        return 'custom_period_days';
      }
      return null;
  }
}

function translateBudgetValidationError(
  message: string | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (!message) return null;

  switch (message) {
    case 'budgets.form.errors.semimonthlyScheduleRequired':
      return t('budgets.form.errors.semimonthlyScheduleRequired', { ns: 'portal' });
    case 'budgets.form.errors.biweeklyAnchorRequired':
      return t('budgets.form.errors.biweeklyAnchorRequired', { ns: 'portal' });
    case 'budgets.form.errors.customAnchorRequired':
      return t('budgets.form.errors.customAnchorRequired', { ns: 'portal' });
    case 'budgets.form.errors.customCycleLengthInvalid':
      return t('budgets.form.errors.customCycleLengthInvalid', { ns: 'portal' });
    case 'Enter a valid IANA timezone such as Europe/London or Asia/Dubai.':
      return t('financialPeriods.validation.timezone', { ns: 'portal' });
    case 'Custom week start must be a day index from 0 to 6.':
      return t('financialPeriods.validation.customWeekStartDay', { ns: 'portal' });
    case 'Weekly schedules need a recent or upcoming payday anchor date.':
      return t('financialPeriods.validation.weeklyAnchorDate', { ns: 'portal' });
    case 'Every 2 weeks schedules need one recent or upcoming payday anchor date.':
      return t('financialPeriods.validation.biweeklyAnchorDate', { ns: 'portal' });
    case 'Custom schedules need an anchor date.':
      return t('financialPeriods.validation.customAnchorDate', { ns: 'portal' });
    case 'Choose the first semimonthly payday.':
      return t('financialPeriods.validation.semimonthlyDay1Required', { ns: 'portal' });
    case 'Choose the second semimonthly payday.':
      return t('financialPeriods.validation.semimonthlyDay2Required', { ns: 'portal' });
    case 'Semimonthly day 1 must be 1-31 or Last day of the month.':
      return t('financialPeriods.validation.semimonthlyDay1Range', { ns: 'portal' });
    case 'Semimonthly day 2 must be 1-31 or Last day of the month.':
      return t('financialPeriods.validation.semimonthlyDay2Range', { ns: 'portal' });
    case 'Twice-a-month schedules need two different payday positions.':
      return t('financialPeriods.validation.semimonthlyDifferentDays', { ns: 'portal' });
    case 'The second semimonthly payday must be later in the month than the first.':
      return t('financialPeriods.validation.semimonthlyDayOrder', { ns: 'portal' });
    case 'Choose how monthly payday should be calculated.':
      return t('financialPeriods.validation.monthlyRuleRequired', { ns: 'portal' });
    case 'Specific monthly payday must be a day from 1 to 31.':
      return t('financialPeriods.validation.monthlyDayRange', { ns: 'portal' });
    case 'Irregular income uses current month as the dashboard default.':
      return t('financialPeriods.validation.irregularDashboardPeriod', { ns: 'portal' });
    default:
      if (message.startsWith('Custom schedules must repeat every ')) {
        const match = message.match(/(\d+)-(\d+)/);
        return t('financialPeriods.validation.customCycleDays', {
          ns: 'portal',
          min: match?.[1] ?? '2',
          max: match?.[2] ?? '90',
        });
      }
      return message;
  }
}

function getLegacyPeriodValue(budgetPeriod: BudgetPeriod): Budget['period'] {
  if (budgetPeriod === 'monthly') return 'monthly';
  if (budgetPeriod === 'weekly') return 'weekly';
  return 'custom';
}

export default function AddBudgetForm({
  budget = null,
  onSuccess,
  onCancel,
  spaceId = null,
  spaceName = null,
}: AddBudgetFormProps) {
  const { t } = useTranslation(['portal', 'common']);
  const { data: referenceData } = useClientReferenceData();
  const [isLoading, setIsLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [periodContext, setPeriodContext] = useState<UserFinancialPeriodContext | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<BudgetFormState>(() => buildInitialFormState(budget));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<BudgetFieldKey, string>>>({});
  const [hasAppliedProfileDefault, setHasAppliedProfileDefault] = useState(Boolean(budget));
  const autoAppliedCurrencyRef = useRef('');

  useEffect(() => {
    setForm(buildInitialFormState(budget));
    setHasAppliedProfileDefault(Boolean(budget));
  }, [budget]);

  const refreshCreateModeCurrency = useCallback(async () => {
    if (budget) {
      autoAppliedCurrencyRef.current = '';
      return;
    }

    const currencyCode = await resolveCurrencyPreference({
      platformCurrency: referenceData?.platformDefaultCurrency,
      forceRefreshUserDefault: true,
    });
    const previousAutoCurrency = autoAppliedCurrencyRef.current;
    autoAppliedCurrencyRef.current = currencyCode;

    setForm((current) => {
      if (current.currency && current.currency !== previousAutoCurrency) {
        return current;
      }

      return current.currency === currencyCode
        ? current
        : { ...current, currency: currencyCode };
    });
  }, [budget, referenceData?.platformDefaultCurrency]);

  useEffect(() => {
    getCategories('expense').then(setCategories).catch(console.error);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadUserFinancialPeriodContext()
      .then((context) => {
        if (cancelled) return;
        setPeriodContext(context);
        setForm((current) => {
          if (budget || hasAppliedProfileDefault) {
            return current;
          }
          const nextBudgetPeriod = context.effectiveConfig.defaultBudgetPeriod;
          return {
            ...current,
            budget_period: nextBudgetPeriod,
            period_anchor_date: current.period_anchor_date || getDefaultBudgetAnchorDate(nextBudgetPeriod, context.effectiveConfig, context.currentBusinessDate),
          };
        });
        setHasAppliedProfileDefault(true);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) {
          setProfileLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [budget, hasAppliedProfileDefault]);

  useEffect(() => {
    let cancelled = false;
    void refreshCreateModeCurrency().catch(() => {
      if (!cancelled) {
        autoAppliedCurrencyRef.current = '';
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refreshCreateModeCurrency]);

  useSmartPocketDataChanged(['profile'], 'AddBudgetFormCurrency', async () => {
    await refreshCreateModeCurrency();
  });

  const updateField = <K extends keyof BudgetFormState>(field: K, value: BudgetFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field in fieldErrors) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[field as BudgetFieldKey];
        return next;
      });
    }
  };

  const scheduleLabel = useMemo(() => formatSemimonthlySchedule(periodContext, t), [periodContext, t]);
  const budgetValidation = useMemo(() => {
    if (!periodContext) return null;
    return validateBudgetPeriodConfig({
      budget_period: form.budget_period,
      period_anchor_date: form.period_anchor_date || null,
      custom_period_days: form.custom_period_days ? Number(form.custom_period_days) : null,
    }, periodContext.effectiveConfig);
  }, [form.budget_period, form.custom_period_days, form.period_anchor_date, periodContext]);

  const periodChangeWarning = useMemo(() => {
    if (!budget) return null;
    const originalPeriod = normalizeBudgetPeriodValue(budget);
    const hasChanged = originalPeriod !== form.budget_period
      || (budget.period_anchor_date || '') !== form.period_anchor_date
      || String(budget.custom_period_days || '') !== form.custom_period_days;
    return hasChanged
      ? t('budgets.form.periodChangeWarning', { ns: 'portal' })
      : null;
  }, [budget, form.budget_period, form.custom_period_days, form.period_anchor_date, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.category_id) {
      const message = t('budgets.form.categoryRequired', { ns: 'portal' });
      setFieldErrors({ category_id: message });
      toast.error(message);
      return;
    }
    if (!form.amount || parseFloat(form.amount) <= 0) {
      const message = t('budgets.form.amountRequired', { ns: 'portal' });
      setFieldErrors({ amount: message });
      toast.error(message);
      return;
    }
    if (!form.currency) {
      const message = t('budgets.form.currencyRequired', { ns: 'portal' });
      setFieldErrors({ currency: message });
      toast.error(message);
      return;
    }
    if (!periodContext) { toast.error(t('budgets.form.loadingPeriodSettings', { ns: 'portal' })); return; }
    if (form.budget_period === 'semimonthly' && !scheduleLabel) {
      const message = t('budgets.form.semimonthlyNeedsSettings', { ns: 'portal' });
      setFieldErrors({ budget_period: message });
      toast.error(message);
      return;
    }
    if (!budgetValidation?.isValid) {
      const message = translateBudgetValidationError(budgetValidation?.error, t)
        || t('budgets.form.incompletePeriodConfig', { ns: 'portal' });
      const field = getBudgetValidationField(budgetValidation?.error);
      setFieldErrors(field ? { [field]: message } : {});
      toast.error(message);
      return;
    }
    setFieldErrors({});
    setIsLoading(true);
    try {
      const budgetName = form.name.trim() || categories.find((c) => c.id === form.category_id)?.name || t('budgets.budgetFallback', { ns: 'portal' });
      const resolvedPeriod = getCurrentBudgetPeriod({
        budget_period: form.budget_period,
        period_anchor_date: form.period_anchor_date || null,
        custom_period_days: form.custom_period_days ? Number(form.custom_period_days) : null,
      }, periodContext.effectiveConfig, periodContext.currentBusinessDate);
      const payload: Partial<Budget> = {
        name: budgetName,
        space_id: spaceId ?? budget?.space_id ?? null,
        category_id: form.category_id || null,
        amount: parseFloat(form.amount),
        currency: form.currency,
        budget_period: form.budget_period,
        period_anchor_date: form.period_anchor_date || null,
        custom_period_days: form.custom_period_days ? parseInt(form.custom_period_days, 10) : null,
        period: getLegacyPeriodValue(form.budget_period),
        period_start: resolvedPeriod.startDate,
        period_end: null,
        alert_at_percent: parseInt(form.alert_at_percent) || 80,
        is_active: true,
      };

      if (budget) {
        await updateBudget(budget.id, payload);
      } else {
        await createBudget(payload);
      }
      dispatchSmartPocketDataChanged({
        source: 'budget-form',
        entities: spaceId ? ['dashboard', 'budgets', 'spaces'] : ['dashboard', 'budgets'],
      });
      onSuccess();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t(budget ? 'budgets.updateFailed' : 'budgets.createFailed', { ns: 'portal' }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {spaceId ? (
        <div className="rounded-2xl border border-info/20 bg-info-soft/40 px-4 py-3 text-sm text-info">
          {t('budgets.form.spaceBudgetNotice', {
            ns: 'portal',
            defaultValue: `This budget will track Space spending for ${spaceName || 'the selected Space'}.`,
            space: spaceName || 'the selected Space',
          })}
        </div>
      ) : null}
      <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        {t('budgets.form.periodIsolationNotice', { ns: 'portal' })}
      </div>
      {periodChangeWarning ? (
        <div className="rounded-2xl border border-warning/30 bg-warning-soft/40 px-4 py-3 text-sm text-warning">
          {periodChangeWarning}
        </div>
      ) : null}
      <div>
        <label className={getFieldLabelClassName(Boolean(fieldErrors.category_id))}>{t('budgets.form.category', { ns: 'portal' })}</label>
        <select
          className={getFieldInputClassName('input-base', Boolean(fieldErrors.category_id))}
          value={form.category_id}
          onChange={(e) => updateField('category_id', e.target.value)}
        >
          <option value="">{t('budgets.form.selectCategory', { ns: 'portal' })}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {fieldErrors.category_id ? <p className={getFieldErrorTextClassName()}>{fieldErrors.category_id}</p> : null}
      </div>
      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">{t('budgets.form.name', { ns: 'portal' })}</label>
        <input type="text" className="input-base" placeholder={t('budgets.form.namePlaceholder', { ns: 'portal' })} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={getFieldLabelClassName(Boolean(fieldErrors.amount))}>{t('budgets.form.amount', { ns: 'portal' })}</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            className={getFieldInputClassName('input-base font-tabular', Boolean(fieldErrors.amount))}
            placeholder="0.00"
            value={form.amount}
            onChange={(e) => updateField('amount', e.target.value)}
          />
          {fieldErrors.amount ? <p className={getFieldErrorTextClassName()}>{fieldErrors.amount}</p> : null}
        </div>
        <div>
          <label className={getFieldLabelClassName(Boolean(fieldErrors.currency))}>{t('budgets.form.currency', { ns: 'portal' })}</label>
          <div className={fieldErrors.currency ? 'rounded-xl border border-negative/40 bg-negative-soft/40 p-1' : ''}>
            <CurrencySelector
              value={form.currency}
              onChange={(currencyCode) => updateField('currency', currencyCode)}
              placeholder={t('budgets.form.currencyPlaceholder', { ns: 'portal' })}
              helperText={fieldErrors.currency || undefined}
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={getFieldLabelClassName(Boolean(fieldErrors.budget_period))}>{t('budgets.form.period', { ns: 'portal' })}</label>
          <select
            className={getFieldInputClassName('input-base', Boolean(fieldErrors.budget_period))}
            aria-label={t('budgets.form.period', { ns: 'portal' })}
            value={form.budget_period}
            onChange={(e) => {
              const nextPeriod = e.target.value as BudgetPeriod;
              setForm((current) => ({
                ...current,
                budget_period: nextPeriod,
                period_anchor_date: nextPeriod === 'monthly' || nextPeriod === 'semimonthly'
                  ? ''
                  : periodContext
                    ? getDefaultBudgetAnchorDate(nextPeriod, periodContext.effectiveConfig, periodContext.currentBusinessDate)
                    : current.period_anchor_date,
                custom_period_days: nextPeriod === 'custom' ? current.custom_period_days || '10' : '',
              }));
              setFieldErrors((current) => {
                if (!current.budget_period && !current.period_anchor_date && !current.custom_period_days) {
                  return current;
                }
                const next = { ...current };
                delete next.budget_period;
                delete next.period_anchor_date;
                delete next.custom_period_days;
                return next;
              });
            }}
          >
            {(['weekly', 'biweekly', 'semimonthly', 'monthly', 'custom'] as BudgetPeriod[]).map((period) => (
              <option key={period} value={period}>{getBudgetPeriodLabel(period, t)}</option>
            ))}
          </select>
          {fieldErrors.budget_period ? <p className={getFieldErrorTextClassName()}>{fieldErrors.budget_period}</p> : null}
        </div>
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">{t('budgets.form.alertAtPercent', { ns: 'portal' })}</label>
          <input type="number" min="1" max="100" className="input-base" value={form.alert_at_percent} onChange={(e) => setForm((f) => ({ ...f, alert_at_percent: e.target.value }))} />
        </div>
      </div>
      {form.budget_period === 'weekly' || form.budget_period === 'biweekly' || form.budget_period === 'custom' ? (
        <div>
          <label className={getFieldLabelClassName(Boolean(fieldErrors.period_anchor_date))}>
            {t('budgets.form.anchorDate', { ns: 'portal' })}
          </label>
          <input
            type="date"
            className={getFieldInputClassName('input-base', Boolean(fieldErrors.period_anchor_date))}
            value={form.period_anchor_date}
            onChange={(e) => updateField('period_anchor_date', e.target.value)}
          />
          <p className={fieldErrors.period_anchor_date ? getFieldErrorTextClassName('mt-1 text-xs') : 'mt-1 text-xs text-muted-foreground'}>
            {fieldErrors.period_anchor_date
              || (form.budget_period === 'weekly'
                ? t('budgets.form.anchorDateHelp.weekly', { ns: 'portal' })
                : form.budget_period === 'biweekly'
                  ? t('budgets.form.anchorDateHelp.biweekly', { ns: 'portal' })
                  : t('budgets.form.anchorDateHelp.custom', { ns: 'portal' }))}
          </p>
        </div>
      ) : null}
      {form.budget_period === 'custom' ? (
        <div>
          <label className={getFieldLabelClassName(Boolean(fieldErrors.custom_period_days))}>{t('budgets.form.cycleLengthDays', { ns: 'portal' })}</label>
          <input
            type="number"
            min="2"
            max="90"
            className={getFieldInputClassName('input-base', Boolean(fieldErrors.custom_period_days))}
            value={form.custom_period_days}
            onChange={(e) => updateField('custom_period_days', e.target.value)}
          />
          {fieldErrors.custom_period_days ? <p className={getFieldErrorTextClassName()}>{fieldErrors.custom_period_days}</p> : null}
        </div>
      ) : null}
      {form.budget_period === 'semimonthly' ? (
        <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm">
          <p className="font-600 text-foreground mb-1">{t('budgets.form.semimonthlyTitle', { ns: 'portal' })}</p>
          {scheduleLabel ? (
            <p className="text-muted-foreground">{scheduleLabel}</p>
          ) : profileLoading ? (
            <p className="text-muted-foreground">{t('budgets.form.loadingIncomeSchedule', { ns: 'portal' })}</p>
          ) : (
            <p className="text-warning">
              {t('budgets.form.semimonthlyConfigIncomplete', { ns: 'portal' })}{' '}
              <Link href="/settings" className="underline underline-offset-2">
                {t('settings.title', { ns: 'portal' })}
              </Link>
              {' '}{t('budgets.form.semimonthlySettingsSuffix', { ns: 'portal' })}
            </p>
          )}
        </div>
      ) : null}
      {budgetValidation && !budgetValidation.isValid ? (
        <div className="rounded-2xl border border-warning/30 bg-warning-soft/40 px-4 py-3 text-sm text-warning">
          {translateBudgetValidationError(budgetValidation.error, t)}
        </div>
      ) : null}
      <div className="flex gap-2 justify-end pt-2 border-t border-border">
        <button type="button" onClick={onCancel} className="btn-secondary">{t('actions.cancel', { ns: 'common' })}</button>
        <button type="submit" disabled={isLoading} className="btn-primary">
          {isLoading ? <><Loader2 size={15} className="animate-spin" /> {budget ? t('status.saving', { ns: 'common' }) : t('status.creating', { ns: 'common' })}</> : budget ? t('budgets.editAction', { ns: 'portal' }) : t('budgets.addCategoryBudget', { ns: 'portal' })}
        </button>
      </div>
    </form>
  );
}
