'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Loader2, ChevronRight, ChevronLeft, CheckCircle2, Globe, DollarSign, User, TrendingUp, CalendarDays } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import AppLogo from '@/components/ui/AppLogo';
import CountrySelector from '@/components/country/CountrySelector';
import CurrencySelector from '@/components/CurrencySelector';
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

export default function OnboardingPage() {
  const { t } = useTranslation(['portal', 'common']);
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [currencyManuallySelected, setCurrencyManuallySelected] = useState(false);
  const [financialPeriodErrors, setFinancialPeriodErrors] = useState<FinancialPeriodFieldErrors>({});
  const { user } = useAuth();
  const router = useRouter();
  const { data: referenceData } = useClientReferenceData();
  const snapshot = referenceData?.snapshot;
  const defaultFinancialValues = buildFinancialPeriodFormValues({
    timezone: getBrowserTimeZone(),
  });

  const { register, handleSubmit, watch, setValue, getValues, formState: { errors } } = useForm<OnboardingData>({
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
  const incomeFrequency = watch('income_frequency');
  const selectedCountryRecord = getCountryByCode(snapshot?.countries ?? [], selectedCountry);
  const recommendedCurrency = snapshot ? getDefaultCurrencyForCountry(snapshot, selectedCountry) : null;
  const selectedCurrencyRecord = getCurrencyByCode(snapshot?.currencies ?? [], selectedCurrency);
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

  const onFinish = async (data: OnboardingData) => {
    setIsLoading(true);
    try {
      const planningValues = buildPlanningValues(getValues());
      const validation = validateFinancialPeriodForm(planningValues);
      if (!validation.isValid) {
        setFinancialPeriodErrors(validation.fieldErrors);
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

      const { error } = await supabase
        .from('user_profiles')
        .update({
          full_name: data.fullName || currentUser.user_metadata?.full_name || '',
          country: data.country,
          preferred_language: data.preferredLanguage,
          default_currency: data.defaultCurrency,
          monthly_income: data.monthlyIncome ? parseFloat(data.monthlyIncome) : null,
          month_start_day: parseInt(data.monthStartDay),
          ...financialPeriodPayload,
        })
        .eq('id', currentUser.id);
      if (error) throw error;

      try {
        await supabase
          .from('user_profiles')
          .update({ onboarding_completed_at: new Date().toISOString() })
          .eq('id', currentUser.id)
          .is('onboarding_completed_at', null);
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
      toast.error(err?.message || t('onboarding.toasts.saveFailed', { ns: 'portal' }));
    } finally {
      setIsLoading(false);
    }
  };

  const progress = ((step - 1) / (steps.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8 bg-[radial-gradient(circle_at_top_right,rgba(15,159,152,0.08),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(16,59,99,0.08),transparent_35%)]">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <AppLogo size={48} className="mx-auto mb-3" />
          <h1 className="text-3xl font-800 text-foreground">{t('onboarding.title', { ns: 'portal' })}</h1>
          <p className="text-base text-muted-foreground mt-2">{t('onboarding.description', { ns: 'portal' })}</p>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {steps.map((s) => (
              <div key={s.id} className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-700 transition-all ${
                  step > s.id ? 'bg-positive text-white' :
                  step === s.id ? 'bg-accent text-accent-foreground': 'bg-muted text-muted-foreground'
                }`}>
                  {step > s.id ? <CheckCircle2 size={16} /> : s.id}
                </div>
                <span className="text-xs text-muted-foreground hidden sm:block">{s.title}</span>
              </div>
            ))}
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <form onSubmit={handleSubmit(onFinish)}>
          <div className="section-card mb-6">
            <div className="section-card-body p-6 sm:p-7">
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
                <div className="grid grid-cols-2 gap-3">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => setValue('preferredLanguage', lang.code)}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                        selectedLanguage === lang.code
                          ? 'border-accent bg-accent/5' :'border-border hover:border-accent/40'
                      }`}
                    >
                      <span className="text-2xl">{lang.flag}</span>
                      <div className="text-left">
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
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-600">
                      {selectedCurrencyRecord?.code || selectedCurrency || referenceData?.platformDefaultCurrency || 'CUR'}
                    </span>
                    <input
                      id="ob-income"
                      type="number"
                      step="0.01"
                      min="0"
                      className="input-base pl-16 font-tabular"
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
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 1}
              className="btn-secondary disabled:opacity-40"
            >
              <ChevronLeft size={16} />
              Back
            </button>

            {step < steps.length ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="btn-primary"
              >
                {t('actions.continue', { ns: 'common' })}
                <ChevronRight size={16} />
              </button>
            ) : (
              <button type="submit" disabled={isLoading} className="btn-primary">
                {isLoading ? (
                  <><Loader2 size={16} className="animate-spin" />{t('status.saving', { ns: 'common' })}</>
                ) : (
                  <>{t('getStarted', { ns: 'public' })} <CheckCircle2 size={16} /></>
                )}
              </button>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-4">
            <button type="button" onClick={() => router.replace('/dashboard')} className="hover:text-accent transition-colors">
              {t('onboarding.skipForNow', { ns: 'portal' })}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
