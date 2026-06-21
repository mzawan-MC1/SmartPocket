'use client';
import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { createBudget, getCategories, updateBudget, type Budget, type Category } from '@/lib/finance';
import { useEffect } from 'react';
import { toast } from 'sonner';
import CurrencySelector from '@/components/CurrencySelector';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { resolveUserDefaultCurrency } from '@/lib/currency-totals';
import { dispatchSmartPocketDataChanged } from '@/lib/data-change';
import { loadUserFinancialPeriodContext, type UserFinancialPeriodContext } from '@/lib/financial-periods/profile';
import { getBudgetPeriodTypeLabel, getCurrentBudgetPeriod, getDefaultBudgetAnchorDate, normalizeBudgetPeriodValue, validateBudgetPeriodConfig } from '@/lib/financial-periods/budgets';
import type { BudgetPeriod } from '@/lib/financial-periods';

interface AddBudgetFormProps {
  budget?: Budget | null;
  onSuccess: () => void;
  onCancel: () => void;
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

function translateBudgetValidationError(
  message: string | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (!message) return null;

  switch (message) {
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

export default function AddBudgetForm({ budget = null, onSuccess, onCancel }: AddBudgetFormProps) {
  const { t } = useTranslation(['portal', 'common']);
  const { data: referenceData } = useClientReferenceData();
  const [isLoading, setIsLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [periodContext, setPeriodContext] = useState<UserFinancialPeriodContext | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<BudgetFormState>(() => buildInitialFormState(budget));
  const [hasAppliedProfileDefault, setHasAppliedProfileDefault] = useState(Boolean(budget));

  useEffect(() => {
    setForm(buildInitialFormState(budget));
    setHasAppliedProfileDefault(Boolean(budget));
  }, [budget]);

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
    void resolveUserDefaultCurrency(referenceData?.platformDefaultCurrency).then((currencyCode) => {
      if (!cancelled) {
        setForm((current) => (current.currency ? current : { ...current, currency: currencyCode }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [referenceData?.platformDefaultCurrency]);

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
    if (!form.category_id) { toast.error(t('budgets.form.categoryRequired', { ns: 'portal' })); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error(t('budgets.form.amountRequired', { ns: 'portal' })); return; }
    if (!form.currency) { toast.error(t('budgets.form.currencyRequired', { ns: 'portal' })); return; }
    if (!periodContext) { toast.error(t('budgets.form.loadingPeriodSettings', { ns: 'portal' })); return; }
    if (form.budget_period === 'semimonthly' && !scheduleLabel) {
      toast.error(t('budgets.form.semimonthlyNeedsSettings', { ns: 'portal' }));
      return;
    }
    if (!budgetValidation?.isValid) {
      toast.error(translateBudgetValidationError(budgetValidation?.error, t) || t('budgets.form.incompletePeriodConfig', { ns: 'portal' }));
      return;
    }
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
        entities: ['dashboard', 'budgets'],
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
      <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        {t('budgets.form.periodIsolationNotice', { ns: 'portal' })}
      </div>
      {periodChangeWarning ? (
        <div className="rounded-2xl border border-warning/30 bg-warning-soft/40 px-4 py-3 text-sm text-warning">
          {periodChangeWarning}
        </div>
      ) : null}
      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">{t('budgets.form.category', { ns: 'portal' })}</label>
        <select className="input-base" value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}>
          <option value="">{t('budgets.form.selectCategory', { ns: 'portal' })}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">{t('budgets.form.name', { ns: 'portal' })}</label>
        <input type="text" className="input-base" placeholder={t('budgets.form.namePlaceholder', { ns: 'portal' })} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">{t('budgets.form.amount', { ns: 'portal' })}</label>
          <input type="number" step="0.01" min="0.01" className="input-base font-tabular" placeholder="0.00" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">{t('budgets.form.currency', { ns: 'portal' })}</label>
          <CurrencySelector
            value={form.currency}
            onChange={(currencyCode) => setForm((f) => ({ ...f, currency: currencyCode }))}
            placeholder={t('budgets.form.currencyPlaceholder', { ns: 'portal' })}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">{t('budgets.form.period', { ns: 'portal' })}</label>
          <select
            className="input-base"
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
            }}
          >
            {(['weekly', 'biweekly', 'semimonthly', 'monthly', 'custom'] as BudgetPeriod[]).map((period) => (
              <option key={period} value={period}>{getBudgetPeriodLabel(period, t)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">{t('budgets.form.alertAtPercent', { ns: 'portal' })}</label>
          <input type="number" min="1" max="100" className="input-base" value={form.alert_at_percent} onChange={(e) => setForm((f) => ({ ...f, alert_at_percent: e.target.value }))} />
        </div>
      </div>
      {form.budget_period === 'weekly' || form.budget_period === 'biweekly' || form.budget_period === 'custom' ? (
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">
            {t('budgets.form.anchorDate', { ns: 'portal' })}
          </label>
          <input
            type="date"
            className="input-base"
            value={form.period_anchor_date}
            onChange={(e) => setForm((current) => ({ ...current, period_anchor_date: e.target.value }))}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {form.budget_period === 'weekly'
              ? t('budgets.form.anchorDateHelp.weekly', { ns: 'portal' })
              : form.budget_period === 'biweekly'
                ? t('budgets.form.anchorDateHelp.biweekly', { ns: 'portal' })
                : t('budgets.form.anchorDateHelp.custom', { ns: 'portal' })}
          </p>
        </div>
      ) : null}
      {form.budget_period === 'custom' ? (
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">{t('budgets.form.cycleLengthDays', { ns: 'portal' })}</label>
          <input
            type="number"
            min="2"
            max="90"
            className="input-base"
            value={form.custom_period_days}
            onChange={(e) => setForm((current) => ({ ...current, custom_period_days: e.target.value }))}
          />
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
