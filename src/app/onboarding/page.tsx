'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Loader2, ChevronRight, ChevronLeft, CheckCircle2, Check, Globe, DollarSign, User, TrendingUp, CalendarDays } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import AppLogo from '@/components/ui/AppLogo';
import CountrySelector from '@/components/country/CountrySelector';
import CurrencySelector from '@/components/CurrencySelector';
import CurrencySymbol from '@/components/currency/CurrencySymbol';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { getDefaultCurrencyForCountry, getCountryByCode, getCurrencyByCode } from '@/lib/reference-data/lookups';
import IncomeFrequencySelector from '@/components/financial-periods/IncomeFrequencySelector';
import PayScheduleFields from '@/components/financial-periods/PayScheduleFields';
import PlanningPreferencesFields from '@/components/financial-periods/PlanningPreferencesFields';
import { clearResolvedUserDefaultCurrencyCache } from '@/lib/currency-totals';
import { dispatchSmartPocketDataChanged } from '@/lib/data-change';
import { type FinancialPeriodFieldErrors } from '@/lib/financial-periods';
import {
  buildFinancialPeriodProfileUpdate,
  buildFinancialPeriodFormValues,
  clearFinancialPeriodProfileCache,
  getBrowserTimeZone,
  type FinancialPeriodFormValues,
  validateFinancialPeriodForm,
  withFrequencyDefaults,
} from '@/lib/financial-periods/profile';

interface OnboardingData {
  fullName: string;
  country: string;
  preferredLanguage: string;
  defaultCurrency: string;
  monthlyIncome: string;
  monthStartDay: string;
  income_frequency: FinancialPeriodFormValues['income_frequency'];
  pay_cycle_anchor_date: string;
  weekly_payday: FinancialPeriodFormValues['weekly_payday'];
  semimonthly_day_1: string;
  semimonthly_day_2: string;
  monthly_payday_rule: FinancialPeriodFormValues['monthly_payday_rule'];
  monthly_payday_day: string;
  default_dashboard_period: FinancialPeriodFormValues['default_dashboard_period'];
  default_budget_period: FinancialPeriodFormValues['default_budget_period'];
  week_starts_on: FinancialPeriodFormValues['week_starts_on'];
  week_starts_on_custom_day: string;
  timezone: string;
  custom_cycle_days: string;
}

const camelCaseFieldErrorMap: Record<keyof FinancialPeriodFormValues, keyof FinancialPeriodFieldErrors> = {
  income_frequency: 'incomeFrequency',
  pay_cycle_anchor_date: 'payCycleAnchorDate',
  weekly_payday: 'weeklyPayday',
  semimonthly_day_1: 'semimonthlyDay1',
  semimonthly_day_2: 'semimonthlyDay2',
  monthly_payday_rule: 'monthlyPaydayRule',
  monthly_payday_day: 'monthlyPaydayDay',
  default_dashboard_period: 'defaultDashboardPeriod',
  default_budget_period: 'defaultBudgetPeriod',
  week_starts_on: 'weekStartsOn',
  week_starts_on_custom_day: 'weekStartsOnCustomDay',
  timezone: 'timezone',
  custom_cycle_days: 'customCycleDays',
};

function buildPlanningValues(data: Pick<OnboardingData, keyof FinancialPeriodFormValues>): FinancialPeriodFormValues {
  return {
    income_frequency: data.income_frequency,
    pay_cycle_anchor_date: data.pay_cycle_anchor_date,
    weekly_payday: data.weekly_payday,
    semimonthly_day_1: data.semimonthly_day_1,
    semimonthly_day_2: data.semimonthly_day_2,
    monthly_payday_rule: data.monthly_payday_rule,
    monthly_payday_day: data.monthly_payday_day,
    default_dashboard_period: data.default_dashboard_period,
    default_budget_period: data.default_budget_period,
    week_starts_on: data.week_starts_on,
    week_starts_on_custom_day: data.week_starts_on_custom_day,
    timezone: data.timezone,
    custom_cycle_days: data.custom_cycle_days,
  };
}

function formatOnboardingDate(value: string, locale: string) {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

function getIncomeFrequencyLabel(
  value: FinancialPeriodFormValues['income_frequency'],
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (value) {
    case 'weekly':
      return t('financialPeriods.incomeFrequency.options.weekly.label', { ns: 'portal' });
    case 'biweekly':
      return t('financialPeriods.incomeFrequency.options.biweekly.label', { ns: 'portal' });
    case 'semimonthly':
      return t('financialPeriods.incomeFrequency.options.semimonthly.label', { ns: 'portal' });
    case 'monthly':
      return t('financialPeriods.incomeFrequency.options.monthly.label', { ns: 'portal' });
    case 'custom':
      return t('financialPeriods.incomeFrequency.options.custom.label', { ns: 'portal' });
    case 'irregular':
    default:
      return t('financialPeriods.incomeFrequency.options.irregular.label', { ns: 'portal' });
  }
}

function getDashboardPeriodLabel(
  value: FinancialPeriodFormValues['default_dashboard_period'],
  t: (key: string, options?: Record<string, unknown>) => string
) {
  return value === 'pay_cycle'
    ? t('financialPeriods.preferences.dashboardOptions.payCycle', { ns: 'portal' })
    : t('financialPeriods.preferences.dashboardOptions.month', { ns: 'portal' });
}

function getBudgetPeriodLabel(
  value: FinancialPeriodFormValues['default_budget_period'],
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (value) {
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

function getWeekStartLabel(
  value: FinancialPeriodFormValues['week_starts_on'],
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (value) {
    case 'sunday':
      return t('financialPeriods.weekdays.sunday', { ns: 'portal' });
    case 'saturday':
      return t('financialPeriods.weekdays.saturday', { ns: 'portal' });
    case 'custom':
      return t('financialPeriods.preferences.customDay', { ns: 'portal' });
    case 'monday':
    default:
      return t('financialPeriods.weekdays.monday', { ns: 'portal' });
  }
}

function buildStepFourErrors(errors: FinancialPeriodFieldErrors): FinancialPeriodFieldErrors {
  return {
    incomeFrequency: errors.incomeFrequency,
    payCycleAnchorDate: errors.payCycleAnchorDate,
    weeklyPayday: errors.weeklyPayday,
    semimonthlyDay1: errors.semimonthlyDay1,
    semimonthlyDay2: errors.semimonthlyDay2,
    monthlyPaydayRule: errors.monthlyPaydayRule,
    monthlyPaydayDay: errors.monthlyPaydayDay,
    customCycleDays: errors.customCycleDays,
  };
}

function hasFieldErrors(errors: FinancialPeriodFieldErrors) {
  return Object.values(errors).some(Boolean);
}

export default function OnboardingPage() {
  const { t, i18n } = useTranslation(['portal', 'common']);
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [currencyManuallySelected, setCurrencyManuallySelected] = useState(false);
  const [financialPeriodErrors, setFinancialPeriodErrors] = useState<FinancialPeriodFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { user } = useAuth();
  const router = useRouter();
  const { data: referenceData } = useClientReferenceData();
  const payScheduleContainerRef = React.useRef<HTMLDivElement>(null);
  const payScheduleInputRef = React.useRef<HTMLInputElement>(null);
  const snapshot = referenceData?.snapshot;
  const locale = i18n.language || 'en';
  const defaultFinancialValues = buildFinancialPeriodFormValues({
    timezone: getBrowserTimeZone(),
  });

  const { register, handleSubmit, watch, setValue, getValues, trigger, formState: { errors } } = useForm<OnboardingData>({
    defaultValues: {
      fullName: '',
      country: '',
      preferredLanguage: 'en',
      defaultCurrency: referenceData?.platformDefaultCurrency || '',
      monthlyIncome: '',
      monthStartDay: '1',
      ...defaultFinancialValues,
    },
  });

  const selectedLanguage = watch('preferredLanguage');
  const selectedCountry = watch('country');
  const selectedCurrency = watch('defaultCurrency');
  const monthlyIncome = watch('monthlyIncome');
  const incomeFrequency = watch('income_frequency');
  const payCycleAnchorDate = watch('pay_cycle_anchor_date');
  const selectedCountryRecord = getCountryByCode(snapshot?.countries ?? [], selectedCountry);
  const recommendedCurrency = snapshot ? getDefaultCurrencyForCountry(snapshot, selectedCountry) : null;
  const selectedCurrencyRecord = getCurrencyByCode(snapshot?.currencies ?? [], selectedCurrency);
  const requiresAnchorDate = incomeFrequency === 'weekly' || incomeFrequency === 'biweekly' || incomeFrequency === 'custom';
  const languages = [
    { code: 'en', name: t('language.en', { ns: 'common' }), flag: '🇬🇧' },
    { code: 'ar', name: t('language.ar', { ns: 'common' }), flag: '🇦🇪' },
    { code: 'fr', name: t('language.fr', { ns: 'common' }), flag: '🇫🇷' },
    { code: 'ru', name: t('language.ru', { ns: 'common' }), flag: '🇷🇺' },
  ];
  const steps = [
    { id: 1, title: t('onboarding.steps.welcome', { ns: 'portal' }), icon: User },
    { id: 2, title: t('onboarding.steps.languageRegion', { ns: 'portal' }), icon: Globe },
    { id: 3, title: t('onboarding.steps.currency', { ns: 'portal' }), icon: DollarSign },
    { id: 4, title: t('onboarding.steps.incomeSchedule', { ns: 'portal' }), icon: TrendingUp },
    { id: 5, title: t('onboarding.steps.planning', { ns: 'portal' }), icon: CalendarDays },
  ];
  const currentStep = steps.find((entry) => entry.id === step) ?? steps[0];
  const financialPeriodValues: FinancialPeriodFormValues = {
    income_frequency: incomeFrequency,
    pay_cycle_anchor_date: watch('pay_cycle_anchor_date'),
    weekly_payday: watch('weekly_payday'),
    semimonthly_day_1: watch('semimonthly_day_1'),
    semimonthly_day_2: watch('semimonthly_day_2'),
    monthly_payday_rule: watch('monthly_payday_rule'),
    monthly_payday_day: watch('monthly_payday_day'),
    default_dashboard_period: watch('default_dashboard_period'),
    default_budget_period: watch('default_budget_period'),
    week_starts_on: watch('week_starts_on'),
    week_starts_on_custom_day: watch('week_starts_on_custom_day'),
    timezone: watch('timezone'),
    custom_cycle_days: watch('custom_cycle_days'),
  };
  const progress = ((step - 1) / (steps.length - 1)) * 100;

  React.useEffect(() => {
    if (!snapshot) return;

    if (!selectedCurrency && referenceData?.platformDefaultCurrency) {
      setValue('defaultCurrency', referenceData.platformDefaultCurrency);
    }
  }, [referenceData?.platformDefaultCurrency, selectedCurrency, setValue, snapshot]);

  React.useEffect(() => {
    if (!recommendedCurrency || currencyManuallySelected) return;
    setValue('defaultCurrency', recommendedCurrency.code);
  }, [currencyManuallySelected, recommendedCurrency, setValue]);

  const setFinancialField = <K extends keyof FinancialPeriodFormValues>(field: K, value: FinancialPeriodFormValues[K]) => {
    setFinancialPeriodErrors((current) => ({ ...current, [camelCaseFieldErrorMap[field]]: undefined }));
    setValue(field as keyof OnboardingData, value as OnboardingData[keyof OnboardingData], { shouldDirty: true });
  };

  const applyFinancialValues = (nextValues: FinancialPeriodFormValues) => {
    (Object.entries(nextValues) as Array<[keyof FinancialPeriodFormValues, FinancialPeriodFormValues[keyof FinancialPeriodFormValues]]>)
      .forEach(([field, value]) => {
        setValue(field as keyof OnboardingData, value as OnboardingData[keyof OnboardingData], { shouldDirty: true });
      });
  };

  const focusAnchorField = React.useCallback(() => {
    const container = payScheduleContainerRef.current;
    if (container) {
      container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    window.requestAnimationFrame(() => {
      payScheduleInputRef.current?.focus();
    });
  }, []);

  React.useEffect(() => {
    if (step !== 4 || !requiresAnchorDate) return;

    const frameId = window.requestAnimationFrame(() => {
      const container = payScheduleContainerRef.current;
      if (!container) return;

      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const rect = container.getBoundingClientRect();
      if (rect.bottom > viewportHeight - 112) {
        container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [incomeFrequency, requiresAnchorDate, step]);

  const validateStepFour = React.useCallback(() => {
    const planningValues = buildPlanningValues(getValues());
    const validation = validateFinancialPeriodForm(planningValues);
    const nextErrors = buildStepFourErrors(validation.fieldErrors);

    if (requiresAnchorDate && !planningValues.pay_cycle_anchor_date) {
      nextErrors.payCycleAnchorDate =
        planningValues.income_frequency === 'weekly'
          ? t('onboarding.validation.step4.weeklyAnchor', { ns: 'portal' })
          : planningValues.income_frequency === 'biweekly'
            ? t('onboarding.validation.step4.biweeklyAnchor', { ns: 'portal' })
            : t('onboarding.validation.step4.genericAnchor', { ns: 'portal' });
    }

    setFinancialPeriodErrors(nextErrors);

    if (hasFieldErrors(nextErrors)) {
      if (nextErrors.payCycleAnchorDate) {
        focusAnchorField();
      } else {
        payScheduleContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return false;
    }

    return true;
  }, [focusAnchorField, getValues, requiresAnchorDate, t]);

  const handleContinue = async () => {
    setSubmitError(null);

    if (step === 1) {
      const isValid = await trigger(['fullName', 'country']);
      if (!isValid) return;
    }

    if (step === 3) {
      const isValid = await trigger('defaultCurrency');
      if (!isValid) return;
    }

    if (step === 4 && !validateStepFour()) {
      return;
    }

    setStep((current) => Math.min(current + 1, steps.length));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onFinish = async (data: OnboardingData) => {
    if (isLoading) return;
    setIsLoading(true);
    setSubmitError(null);
    try {
      const planningValues = buildPlanningValues(getValues());
      const validation = validateFinancialPeriodForm(planningValues);
      if (!validation.isValid) {
        setFinancialPeriodErrors(validation.fieldErrors);
        if (hasFieldErrors(buildStepFourErrors(validation.fieldErrors))) {
          setStep(4);
          if (validation.fieldErrors.payCycleAnchorDate) {
            focusAnchorField();
          }
        }
        toast.error(validation.errors[0] || t('onboarding.toasts.reviewPlanningSettings', { ns: 'portal' }));
        return;
      }

      const financialPeriodPayload = buildFinancialPeriodProfileUpdate(planningValues);
      const supabase = createClient();
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      const currentUser = authUser ?? user;
      if (!currentUser) {
        throw new Error(t('errors.sessionExpired', { ns: 'common' }));
      }

      const completedAt = new Date().toISOString();
      const { error } = await supabase
        .from('user_profiles')
        .update({
          full_name: data.fullName || currentUser.user_metadata?.full_name || '',
          country: data.country,
          preferred_language: data.preferredLanguage,
          default_currency: data.defaultCurrency,
          monthly_income: data.monthlyIncome ? parseFloat(data.monthlyIncome) : null,
          month_start_day: parseInt(data.monthStartDay),
          onboarding_completed_at: completedAt,
          ...financialPeriodPayload,
        })
        .eq('id', currentUser.id);
      if (error) throw error;

      try {
        await fetch('/api/financial-accounts/ensure-defaults', {
          method: 'POST',
          credentials: 'include',
        });
      } catch {
      }

      clearResolvedUserDefaultCurrencyCache();
      clearFinancialPeriodProfileCache();
      dispatchSmartPocketDataChanged({
        source: 'OnboardingPage',
        entities: ['profile', 'dashboard', 'transactions', 'financial_accounts', 'recurring_transactions'],
      });
      toast.success(t('onboarding.toasts.profileReady', { ns: 'portal' }));
      router.replace('/dashboard');
    } catch (err: any) {
      const message = err?.message || t('onboarding.toasts.saveFailed', { ns: 'portal' });
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };
  const selectedLanguageLabel =
    languages.find((language) => language.code === selectedLanguage)?.name || selectedLanguage.toUpperCase();
  const selectedCurrencyLabel = selectedCurrencyRecord
    ? `${selectedCurrencyRecord.code} · ${selectedCurrencyRecord.name}`
    : selectedCurrency || t('onboarding.summary.notProvided', { ns: 'portal' });
  const monthlyIncomeSummary = monthlyIncome
    ? `${selectedCurrencyRecord?.code || selectedCurrency || referenceData?.platformDefaultCurrency || 'CUR'} ${monthlyIncome}`
    : t('onboarding.summary.notProvided', { ns: 'portal' });
  const summaryItems = [
    { label: t('onboarding.summary.fullName', { ns: 'portal' }), value: watch('fullName') || t('onboarding.summary.notProvided', { ns: 'portal' }) },
    { label: t('onboarding.summary.country', { ns: 'portal' }), value: selectedCountryRecord?.name || t('onboarding.summary.notProvided', { ns: 'portal' }) },
    { label: t('onboarding.summary.language', { ns: 'portal' }), value: selectedLanguageLabel },
    { label: t('onboarding.summary.reportingCurrency', { ns: 'portal' }), value: selectedCurrencyLabel },
    { label: t('onboarding.summary.monthlyIncome', { ns: 'portal' }), value: monthlyIncomeSummary },
    { label: t('onboarding.summary.incomeSchedule', { ns: 'portal' }), value: getIncomeFrequencyLabel(financialPeriodValues.income_frequency, t) },
    {
      label: t('onboarding.summary.paydayAnchor', { ns: 'portal' }),
      value: requiresAnchorDate
        ? formatOnboardingDate(payCycleAnchorDate, locale) || t('onboarding.summary.notProvided', { ns: 'portal' })
        : t('onboarding.summary.notNeeded', { ns: 'portal' }),
    },
    { label: t('onboarding.summary.dashboardView', { ns: 'portal' }), value: getDashboardPeriodLabel(financialPeriodValues.default_dashboard_period, t) },
    { label: t('onboarding.summary.defaultBudgetPeriod', { ns: 'portal' }), value: getBudgetPeriodLabel(financialPeriodValues.default_budget_period, t) },
    { label: t('onboarding.summary.weekStart', { ns: 'portal' }), value: getWeekStartLabel(financialPeriodValues.week_starts_on, t) },
    { label: t('onboarding.summary.timezone', { ns: 'portal' }), value: financialPeriodValues.timezone || t('onboarding.summary.notProvided', { ns: 'portal' }) },
  ];

  return (
    <div className="min-h-screen min-h-[100dvh] overflow-x-hidden bg-background bg-[radial-gradient(circle_at_top_right,rgba(15,159,152,0.08),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(16,59,99,0.08),transparent_35%)] px-3 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-4 sm:pt-8 sm:pb-8">
      <div className="mx-auto w-full max-w-2xl">
        {/* Header */}
        <div className="mb-5 text-center sm:mb-8">
          <AppLogo size={48} className="mx-auto mb-3" />
          <h1 className="text-xl font-800 text-foreground sm:text-3xl">{t('onboarding.title', { ns: 'portal' })}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">{t('onboarding.description', { ns: 'portal' })}</p>
        </div>

        {/* Progress */}
        <div className="mb-5 space-y-3 rounded-[1.5rem] border border-border/70 bg-card/70 p-3.5 shadow-card-sm sm:mb-8 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
          <p className="text-center text-[11px] font-700 uppercase tracking-[0.18em] text-muted-foreground">
            {t('onboarding.progress.stepCounter', { ns: 'portal', current: step, total: steps.length })}
          </p>
          <p className="text-center text-sm font-700 text-foreground sm:hidden">{currentStep.title}</p>
          <ol className="relative grid grid-cols-5 gap-2" aria-label={t('onboarding.progress.label', { ns: 'portal' })}>
            <div
              className="absolute top-4 h-0.5 rounded-full bg-muted"
              style={{ insetInlineStart: '1rem', insetInlineEnd: '1rem' }}
              aria-hidden="true"
            />
            <div
              className="absolute top-4 h-0.5 rounded-full bg-accent transition-all duration-500"
              style={{ insetInlineStart: '1rem', width: `calc((100% - 2rem) * ${progress / 100})` }}
              aria-hidden="true"
            />
            {steps.map((s) => (
              <li key={s.id} className="relative z-10 flex min-w-0 flex-col items-center gap-2" aria-current={step === s.id ? 'step' : undefined}>
                <span className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-700 transition-all sm:h-9 sm:w-9 ${
                  step > s.id
                    ? 'border-positive bg-positive text-white'
                    : step === s.id
                      ? 'border-accent bg-accent text-accent-foreground'
                      : 'border-border bg-card text-muted-foreground'
                }`}>
                  {step > s.id ? <Check size={14} /> : s.id}
                </span>
                <span className="hidden text-center text-[11px] leading-4 text-muted-foreground sm:block">{s.title}</span>
              </li>
            ))}
          </ol>
        </div>

        <form onSubmit={handleSubmit(onFinish)} className="space-y-4 pb-24 sm:pb-0">
          <div className="section-card">
            <div className="section-card-body p-4 sm:p-6">
            {/* Step 1: Welcome */}
            {step === 1 && (
              <div className="space-y-5 fade-in">
                <div>
                  <h2 className="text-lg font-700 text-foreground mb-1">{t('onboarding.welcome.title', { ns: 'portal' })}</h2>
                  <p className="text-sm text-muted-foreground">{t('onboarding.welcome.description', { ns: 'portal' })}</p>
                </div>
                <div>
                  <label htmlFor="ob-name" className="block text-sm font-600 text-foreground mb-1.5">{t('people.form.fullName', { ns: 'portal' })}</label>
                  <input
                    id="ob-name"
                    type="text"
                    autoComplete="name"
                    className={`input-base ${errors.fullName ? 'input-error' : ''}`}
                    placeholder={t('onboarding.welcome.fullNamePlaceholder', { ns: 'portal' })}
                    {...register('fullName', { required: t('onboarding.validation.fullName', { ns: 'portal' }) })}
                  />
                  {errors.fullName && <p className="mt-1.5 text-xs text-negative font-500">{errors.fullName.message}</p>}
                </div>
                <div>
                  <label htmlFor="ob-country" className="block text-sm font-600 text-foreground mb-1.5">{t('onboarding.welcome.country', { ns: 'portal' })}</label>
                  <CountrySelector
                    value={selectedCountry}
                    onChange={(countryCode) => setValue('country', countryCode, { shouldDirty: true })}
                    placeholder={t('onboarding.welcome.countryPlaceholder', { ns: 'portal' })}
                  />
                  <input type="hidden" {...register('country', { required: t('onboarding.validation.country', { ns: 'portal' }) })} />
                  {errors.country && <p className="mt-1.5 text-xs text-negative font-500">{errors.country.message}</p>}
                </div>
              </div>
            )}

            {/* Step 2: Language */}
            {step === 2 && (
              <div className="space-y-5 fade-in">
                <div>
                  <h2 className="text-lg font-700 text-foreground mb-1">{t('onboarding.language.title', { ns: 'portal' })}</h2>
                  <p className="text-sm text-muted-foreground">{t('onboarding.language.description', { ns: 'portal' })}</p>
                </div>
                <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => setValue('preferredLanguage', lang.code)}
                      className={`flex min-h-[4.25rem] items-center gap-3 rounded-2xl border-2 p-3.5 text-start transition-all ${
                        selectedLanguage === lang.code
                          ? 'border-accent bg-accent/5' :'border-border hover:border-accent/40'
                      }`}
                    >
                      <span className="text-2xl">{lang.flag}</span>
                      <div className="min-w-0 text-start">
                        <p className="text-sm font-600 text-foreground">{lang.name}</p>
                        <p className="text-xs text-muted-foreground">{lang.code.toUpperCase()}</p>
                      </div>
                      {selectedLanguage === lang.code && (
                        <CheckCircle2 size={16} className="text-accent ms-auto" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Currency */}
            {step === 3 && (
              <div className="space-y-5 fade-in">
                <div>
                  <h2 className="text-lg font-700 text-foreground mb-1">{t('onboarding.currency.title', { ns: 'portal' })}</h2>
                  <p className="text-sm text-muted-foreground">{t('onboarding.currency.description', { ns: 'portal' })}</p>
                </div>
                {selectedCountryRecord && recommendedCurrency ? (
                  <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-foreground">
                    {t('onboarding.currency.recommended', {
                      ns: 'portal',
                      country: selectedCountryRecord.name,
                      currency: recommendedCurrency.name,
                      code: recommendedCurrency.code,
                    })}
                  </div>
                ) : null}
                <CurrencySelector
                  value={selectedCurrency}
                  onChange={(currencyCode) => {
                    setCurrencyManuallySelected(true);
                    setValue('defaultCurrency', currencyCode, { shouldDirty: true });
                  }}
                  showCountryCount
                  placeholder={t('onboarding.currency.placeholder', { ns: 'portal' })}
                />
                <input type="hidden" {...register('defaultCurrency', { required: t('onboarding.validation.currency', { ns: 'portal' }) })} />
                {errors.defaultCurrency ? (
                  <p className="mt-1.5 text-xs text-negative font-500">{errors.defaultCurrency.message}</p>
                ) : null}
              </div>
            )}

            {/* Step 4: Income */}
            {step === 4 && (
              <div className="space-y-5 fade-in">
                <div>
                  <h2 className="text-lg font-700 text-foreground mb-1">{t('onboarding.income.title', { ns: 'portal' })}</h2>
                  <p className="text-sm text-muted-foreground">{t('onboarding.income.description', { ns: 'portal' })}</p>
                </div>
                <div>
                  <label htmlFor="ob-income" className="block text-sm font-600 text-foreground mb-1.5">
                    {t('onboarding.income.monthlyIncome', { ns: 'portal' })}
                  </label>
                  <div className="flex min-h-12 overflow-hidden rounded-2xl border border-border bg-card transition-shadow focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15">
                    <div className="flex w-20 shrink-0 items-center gap-2 border-e border-border bg-muted/30 px-2.5 text-sm font-700 text-foreground min-[360px]:w-24 min-[360px]:px-3">
                      {selectedCurrencyRecord ? (
                        <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden">
                          <CurrencySymbol currency={selectedCurrencyRecord} size="xs" alignment="center" />
                        </span>
                      ) : null}
                      <span className="truncate">
                        {selectedCurrencyRecord?.code || selectedCurrency || referenceData?.platformDefaultCurrency || 'CUR'}
                      </span>
                    </div>
                    <input
                      id="ob-income"
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      className="min-w-0 flex-1 border-0 bg-transparent px-3 py-3 text-base font-tabular text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
                      placeholder="0.00"
                      {...register('monthlyIncome')}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">{t('onboarding.income.monthlyIncomeHelp', { ns: 'portal' })}</p>
                </div>
                <IncomeFrequencySelector
                  value={financialPeriodValues.income_frequency}
                  onChange={(value) => {
                    setFinancialPeriodErrors({});
                    applyFinancialValues(withFrequencyDefaults(financialPeriodValues, value));
                  }}
                  error={financialPeriodErrors.incomeFrequency}
                />
                <PayScheduleFields
                  values={financialPeriodValues}
                  errors={financialPeriodErrors}
                  onChange={setFinancialField}
                  highlightAnchorRequirement={requiresAnchorDate}
                  anchorIntroTitle={t('onboarding.income.anchorTitle', { ns: 'portal' })}
                  anchorIntroDescription={t('onboarding.income.anchorDescription', { ns: 'portal' })}
                  anchorContainerRef={payScheduleContainerRef}
                  anchorInputRef={payScheduleInputRef}
                  anchorErrorId="onboarding-payday-anchor-error"
                />
              </div>
            )}

            {step === 5 && (
              <div className="space-y-5 fade-in">
                <div>
                  <h2 className="text-lg font-700 text-foreground mb-1">{t('onboarding.planning.title', { ns: 'portal' })}</h2>
                  <p className="text-sm text-muted-foreground">{t('onboarding.planning.description', { ns: 'portal' })}</p>
                </div>
                <PlanningPreferencesFields
                  values={financialPeriodValues}
                  errors={financialPeriodErrors}
                  onChange={setFinancialField}
                />
                <div className="rounded-2xl border border-border bg-muted/15 p-4">
                  <div className="mb-3">
                    <h3 className="text-base font-700 text-foreground">{t('onboarding.summary.title', { ns: 'portal' })}</h3>
                    <p className="text-sm text-muted-foreground">{t('onboarding.summary.description', { ns: 'portal' })}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
                    {summaryItems.map((item) => (
                      <div key={item.label} className="rounded-xl border border-border/70 bg-card px-3 py-2.5">
                        <p className="text-[11px] font-700 uppercase tracking-[0.14em] text-muted-foreground">{item.label}</p>
                        <p className="mt-1 text-sm font-600 text-foreground">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {submitError ? (
                  <div className="rounded-2xl border border-negative/20 bg-negative/5 px-4 py-3 text-sm text-negative" role="alert">
                    {submitError}
                  </div>
                ) : null}
              </div>
            )}
            </div>
          </div>

          <input type="hidden" {...register('monthStartDay')} />
          <input type="hidden" {...register('income_frequency')} />
          <input type="hidden" {...register('pay_cycle_anchor_date')} />
          <input type="hidden" {...register('weekly_payday')} />
          <input type="hidden" {...register('semimonthly_day_1')} />
          <input type="hidden" {...register('semimonthly_day_2')} />
          <input type="hidden" {...register('monthly_payday_rule')} />
          <input type="hidden" {...register('monthly_payday_day')} />
          <input type="hidden" {...register('default_dashboard_period')} />
          <input type="hidden" {...register('default_budget_period')} />
          <input type="hidden" {...register('week_starts_on')} />
          <input type="hidden" {...register('week_starts_on_custom_day')} />
          <input type="hidden" {...register('timezone')} />
          <input type="hidden" {...register('custom_cycle_days')} />

          {/* Navigation */}
          <div className="sticky bottom-0 z-20 -mx-3 border-t border-border/70 bg-background/95 px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pt-0 sm:pb-0 sm:backdrop-blur-0">
            <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                disabled={step === 1}
                className="btn-secondary min-h-12 justify-center disabled:opacity-40"
              >
                <ChevronLeft size={16} />
                {t('actions.back', { ns: 'common' })}
              </button>

              {step < steps.length ? (
                <button
                  type="button"
                  onClick={handleContinue}
                  className="btn-primary min-h-12 justify-center"
                >
                  {t('actions.continue', { ns: 'common' })}
                  <ChevronRight size={16} />
                </button>
              ) : (
                <button type="submit" disabled={isLoading} className="btn-primary min-h-12 justify-center">
                  {isLoading ? (
                    <><Loader2 size={16} className="animate-spin" />{t('status.saving', { ns: 'common' })}</>
                  ) : (
                    <>{t('onboarding.actions.finishSetup', { ns: 'portal' })} <CheckCircle2 size={16} /></>
                  )}
                </button>
              )}
            </div>

            <p className="mt-3 text-center text-xs text-muted-foreground">
              <button type="button" onClick={() => router.replace('/dashboard')} className="rounded-lg px-2 py-1 transition-colors hover:text-accent">
                {t('onboarding.skipForNow', { ns: 'portal' })}
              </button>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
