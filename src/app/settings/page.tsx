'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import AppLayout from '@/components/AppLayout';
import { Settings, User, Globe, Bell, Shield, Check, Loader2, CreditCard } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import Tabs from '@/components/ui/Tabs';
import StatusBadge from '@/components/ui/StatusBadge';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { formatPlatformBillingAmount } from '@/lib/subscription/billing-currency';
import { getCountryByCode, getCurrencyByCode, getDefaultCurrencyForCountry } from '@/lib/reference-data/lookups';
import { clearResolvedUserDefaultCurrencyCache } from '@/lib/currency-totals';
import { dispatchSmartPocketDataChanged } from '@/lib/data-change';
import type { FinancialPeriodFieldErrors } from '@/lib/financial-periods';
import {
  buildFinancialPeriodFormValues,
  buildFinancialPeriodProfileUpdate,
  clearFinancialPeriodProfileCache,
  FINANCIAL_PERIOD_PROFILE_SELECT,
  getBrowserTimeZone,
  type FinancialPeriodFormValues,
  validateFinancialPeriodForm,
  withFrequencyDefaults,
} from '@/lib/financial-periods/profile';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/notifications';
import { getIntlLocale } from '@/lib/locale';
import { buildPasswordResetUrl } from '@/lib/auth/urls';
import { fetchSubscriptionSummary } from '@/lib/subscription/client';
import type { SubscriptionSummary } from '@/lib/subscription/types';

const CountrySelector = dynamic(() => import('@/components/country/CountrySelector'), {
  ssr: false,
  loading: () => <div className="input-base h-[42px] animate-pulse bg-muted" />,
});

const CurrencySelector = dynamic(() => import('@/components/CurrencySelector'), {
  ssr: false,
  loading: () => <div className="input-base h-[42px] animate-pulse bg-muted" />,
});

const IncomeFrequencySelector = dynamic(() => import('@/components/financial-periods/IncomeFrequencySelector'), {
  ssr: false,
  loading: () => <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">Loading...</div>,
});

const PayScheduleFields = dynamic(() => import('@/components/financial-periods/PayScheduleFields'), {
  ssr: false,
  loading: () => <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">Loading...</div>,
});

const PlanningPreferencesFields = dynamic(() => import('@/components/financial-periods/PlanningPreferencesFields'), {
  ssr: false,
  loading: () => <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">Loading...</div>,
});

const ReportingCurrencyWizard = dynamic(() => import('./components/ReportingCurrencyWizard'), {
  ssr: false,
  loading: () => null,
});


interface ProfileFormData {
  full_name: string;
  country: string;
  monthly_income: string;
  month_start_day: string;
  default_currency: string;
  preferred_language: string;
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

const SETTINGS_PROFILE_SELECT = [
  'full_name',
  'country',
  'monthly_income',
  'month_start_day',
  'default_currency',
  'preferred_language',
  FINANCIAL_PERIOD_PROFILE_SELECT,
].join(',');

const financialFieldErrorMap: Record<keyof FinancialPeriodFormValues, keyof FinancialPeriodFieldErrors> = {
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

function buildPlanningValues(data: Pick<ProfileFormData, keyof FinancialPeriodFormValues>): FinancialPeriodFormValues {
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

export default function SettingsPage() {
  const { t } = useTranslation(['portal', 'common']);
  const [activeTab, setActiveTab] = useState('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedDefaultCurrency, setSavedDefaultCurrency] = useState('');
  const [showReportingCurrencyWizard, setShowReportingCurrencyWizard] = useState(false);
  const [pendingProfileData, setPendingProfileData] = useState<ProfileFormData | null>(null);
  const [financialPeriodErrors, setFinancialPeriodErrors] = useState<FinancialPeriodFieldErrors>({});
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsSaving, setNotificationsSaving] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [subscriptionSummary, setSubscriptionSummary] = useState<SubscriptionSummary | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const notificationsLoadedForUserRef = useRef<string | null>(null);
  const subscriptionLoadedForUserRef = useRef<string | null>(null);
  const { user } = useAuth();
  const { language, setLanguage, isRTL } = useLanguage();
  const { data: referenceData } = useClientReferenceData();
  const snapshot = referenceData?.snapshot;
  const locale = getIntlLocale(language);
  const defaultFinancialValues = buildFinancialPeriodFormValues({
    timezone: getBrowserTimeZone(),
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<ProfileFormData>({
    defaultValues: {
      full_name: '',
      country: '',
      monthly_income: '',
      month_start_day: '1',
      default_currency: referenceData?.platformDefaultCurrency || '',
      preferred_language: 'en',
      ...defaultFinancialValues,
    },
  });

  const selectedCountry = watch('country');
  const selectedCurrency = watch('default_currency');
  const incomeFrequency = watch('income_frequency');
  const selectedCountryRecord = getCountryByCode(snapshot?.countries ?? [], selectedCountry);
  const recommendedCurrency = snapshot ? getDefaultCurrencyForCountry(snapshot, selectedCountry) : null;
  const selectedCurrencyRecord = getCurrencyByCode(snapshot?.currencies ?? [], selectedCurrency);
  const getCurrencyDisplayName = useCallback((currencyCode: string) => {
    return getCurrencyByCode(snapshot?.currencies ?? [], currencyCode)?.name || currencyCode;
  }, [snapshot?.currencies]);
  const LANGUAGES = [
    { code: 'en', name: t('language.en', { ns: 'common' }) },
    { code: 'ar', name: t('language.ar', { ns: 'common' }) },
    { code: 'fr', name: t('language.fr', { ns: 'common' }) },
    { code: 'ru', name: t('language.ru', { ns: 'common' }) },
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

  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      const supabase = createClient();
      const { data } = await supabase.from('user_profiles').select(SETTINGS_PROFILE_SELECT).eq('id', user.id).single();
      if (data) {
        const nextDefaultCurrency = data.default_currency || referenceData?.platformDefaultCurrency || '';
        reset({
          full_name: data.full_name || '',
          country: data.country || '',
          monthly_income: data.monthly_income?.toString() || '',
          month_start_day: data.month_start_day?.toString() || '1',
          default_currency: nextDefaultCurrency,
          preferred_language: data.preferred_language || 'en',
          ...buildFinancialPeriodFormValues({
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
            timezone: data.timezone || getBrowserTimeZone(),
            custom_cycle_days: data.custom_cycle_days,
          }),
        });
        setSavedDefaultCurrency(nextDefaultCurrency);
      }
    };
    loadProfile();
  }, [referenceData?.platformDefaultCurrency, reset, user]);

  const loadNotificationPreferences = useCallback(async () => {
    setNotificationsLoading(true);
    setNotificationsError(null);
    try {
      const prefs = await getNotificationPreferences();
      setNotificationPreferences(prefs);
    } catch (error: any) {
      const message = error?.message || t('settings.notifications.loadFailed', { ns: 'portal' });
      setNotificationsError(message);
      toast.error(message);
    } finally {
      setNotificationsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!user?.id) {
      notificationsLoadedForUserRef.current = null;
      setNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
      return;
    }
    if (activeTab !== 'notifications') return;
    if (notificationsLoadedForUserRef.current === user.id) return;
    notificationsLoadedForUserRef.current = user.id;
    void loadNotificationPreferences();
  }, [activeTab, loadNotificationPreferences, user?.id]);

  const loadSubscriptionSummary = useCallback(async () => {
    setSubscriptionLoading(true);
    try {
      const payload = await fetchSubscriptionSummary();
      setSubscriptionSummary(payload?.summary || null);
    } catch {
      setSubscriptionSummary(null);
    } finally {
      setSubscriptionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) {
      subscriptionLoadedForUserRef.current = null;
      setSubscriptionSummary(null);
      return;
    }
    if (activeTab !== 'subscription') return;
    if (subscriptionLoadedForUserRef.current === user.id) return;
    subscriptionLoadedForUserRef.current = user.id;
    void loadSubscriptionSummary();
  }, [activeTab, loadSubscriptionSummary, user?.id]);

  const setFinancialField = <K extends keyof FinancialPeriodFormValues>(field: K, value: FinancialPeriodFormValues[K]) => {
    setFinancialPeriodErrors((current) => ({ ...current, [financialFieldErrorMap[field]]: undefined }));
    setValue(field as keyof ProfileFormData, value as ProfileFormData[keyof ProfileFormData], { shouldDirty: true });
  };

  const applyFinancialValues = (nextValues: FinancialPeriodFormValues) => {
    (Object.entries(nextValues) as Array<[keyof FinancialPeriodFormValues, FinancialPeriodFormValues[keyof FinancialPeriodFormValues]]>)
      .forEach(([field, value]) => {
        setValue(field as keyof ProfileFormData, value as ProfileFormData[keyof ProfileFormData], { shouldDirty: true });
      });
  };

  const persistProfile = useCallback(async (
    data: ProfileFormData,
    options?: {
      reportingCurrencyChanged?: boolean;
      suppressSuccessToast?: boolean;
      preserveReportingCurrencyWizard?: boolean;
    }
  ) => {
    if (!user) return;
    setIsSaving(true);
    try {
      const planningValues = buildPlanningValues(getValues());
      const validation = validateFinancialPeriodForm(planningValues);
      if (!validation.isValid) {
        setFinancialPeriodErrors(validation.fieldErrors);
        toast.error(validation.errors[0] || t('settings.planning.validationFallback', { ns: 'portal' }));
        return;
      }

      const financialPeriodPayload = buildFinancialPeriodProfileUpdate(planningValues);
      const supabase = createClient();
      const { data: savedProfile, error } = await supabase
        .from('user_profiles')
        .update({
          full_name: data.full_name,
          country: data.country,
          monthly_income: data.monthly_income ? parseFloat(data.monthly_income) : null,
          month_start_day: parseInt(data.month_start_day),
          default_currency: data.default_currency,
          preferred_language: data.preferred_language,
          ...financialPeriodPayload,
        })
        .eq('id', user.id)
        .select(SETTINGS_PROFILE_SELECT)
        .single();
      if (error) throw error;
      const nextDefaultCurrency = savedProfile.default_currency || referenceData?.platformDefaultCurrency || '';
      setLanguage((savedProfile.preferred_language || 'en') as any);
      clearResolvedUserDefaultCurrencyCache();
      clearFinancialPeriodProfileCache();
      reset({
        full_name: savedProfile.full_name || '',
        country: savedProfile.country || '',
        monthly_income: savedProfile.monthly_income?.toString() || '',
        month_start_day: savedProfile.month_start_day?.toString() || '1',
        default_currency: nextDefaultCurrency,
        preferred_language: savedProfile.preferred_language || 'en',
        ...buildFinancialPeriodFormValues({
          income_frequency: savedProfile.income_frequency,
          pay_cycle_anchor_date: savedProfile.pay_cycle_anchor_date,
          weekly_payday: savedProfile.weekly_payday,
          semimonthly_day_1: savedProfile.semimonthly_day_1,
          semimonthly_day_2: savedProfile.semimonthly_day_2,
          monthly_payday_rule: savedProfile.monthly_payday_rule,
          monthly_payday_day: savedProfile.monthly_payday_day,
          default_dashboard_period: savedProfile.default_dashboard_period,
          default_budget_period: savedProfile.default_budget_period,
          week_starts_on: savedProfile.week_starts_on,
          week_starts_on_custom_day: savedProfile.week_starts_on_custom_day,
          timezone: savedProfile.timezone || getBrowserTimeZone(),
          custom_cycle_days: savedProfile.custom_cycle_days,
        }),
      });
      setSavedDefaultCurrency(nextDefaultCurrency);
      if (!options?.preserveReportingCurrencyWizard) {
        setPendingProfileData(null);
        setShowReportingCurrencyWizard(false);
      }
      dispatchSmartPocketDataChanged({
        source: 'SettingsPage',
        entities: ['profile', 'dashboard', 'transactions', 'financial_accounts', 'recurring_transactions'],
      });
      setSaved(true);
      if (!options?.suppressSuccessToast) {
        toast.success(
          options?.reportingCurrencyChanged
            ? t('settings.preferences.reportingCurrencyChangedNotice', {
                ns: 'portal',
                defaultValue: 'Reporting currency changed to {{currency}}. Existing account currencies were not changed.',
                currency: getCurrencyDisplayName(nextDefaultCurrency),
              })
            : t('settings.saved', { ns: 'portal' })
        );
      }
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      toast.error(err?.message || t('settings.saveFailed', { ns: 'portal' }));
    } finally {
      setIsSaving(false);
    }
  }, [getCurrencyDisplayName, getValues, referenceData?.platformDefaultCurrency, reset, setLanguage, t, user]);

  const onSubmit = async (data: ProfileFormData) => {
    const previousCurrency = (savedDefaultCurrency || '').trim().toUpperCase();
    const nextCurrency = (data.default_currency || '').trim().toUpperCase();
    const reportingCurrencyChanged = previousCurrency !== nextCurrency;

    if (reportingCurrencyChanged) {
      setPendingProfileData(data);
      setShowReportingCurrencyWizard(true);
      return;
    }

    await persistProfile(data);
  };

  const toggleNotificationPreference = (key: keyof NotificationPreferences) => {
    if (key === 'user_id' || key === 'updated_at') return;
    setNotificationPreferences((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const saveNotifications = async () => {
    setNotificationsSaving(true);
    try {
      const savedPreferences = await saveNotificationPreferences(notificationPreferences);
      setNotificationPreferences(savedPreferences);
      setNotificationsError(null);
      toast.success(t('settings.notifications.saved', { ns: 'portal' }));
    } catch (error: any) {
      toast.error(error?.message || t('settings.notifications.saveFailed', { ns: 'portal' }));
    } finally {
      setNotificationsSaving(false);
    }
  };

  const TABS = [
    { id: 'profile', label: t('settings.tabs.profile', { ns: 'portal' }), icon: User },
    { id: 'preferences', label: t('settings.tabs.preferences', { ns: 'portal' }), icon: Globe },
    { id: 'planning', label: t('settings.tabs.planning', { ns: 'portal' }), icon: Settings },
    { id: 'subscription', label: t('settings.tabs.subscription', { ns: 'portal' }), icon: CreditCard },
    { id: 'security', label: t('settings.tabs.security', { ns: 'portal' }), icon: Shield },
    { id: 'notifications', label: t('settings.tabs.notifications', { ns: 'portal' }), icon: Bell },
  ];
  const notificationItems = [
    {
      key: 'in_app_enabled' as const,
      label: t('settings.notifications.items.inApp.label', { ns: 'portal' }),
      desc: t('settings.notifications.items.inApp.description', { ns: 'portal' }),
    },
    {
      key: 'recurring_due_reminders' as const,
      label: t('settings.notifications.items.recurringReminders.label', { ns: 'portal' }),
      desc: t('settings.notifications.items.recurringReminders.description', { ns: 'portal' }),
    },
    {
      key: 'budget_alerts' as const,
      label: t('settings.notifications.items.budgetAlerts.label', { ns: 'portal' }),
      desc: t('settings.notifications.items.budgetAlerts.description', { ns: 'portal' }),
    },
    {
      key: 'reimbursement_updates' as const,
      label: t('settings.notifications.items.reimbursements.label', { ns: 'portal' }),
      desc: t('settings.notifications.items.reimbursements.description', { ns: 'portal' }),
    },
    {
      key: 'account_security_notifications' as const,
      label: t('settings.notifications.items.accountSecurity.label', { ns: 'portal' }),
      desc: t('settings.notifications.items.accountSecurity.description', { ns: 'portal' }),
    },
    {
      key: 'ai_execution_failure_notifications' as const,
      label: t('settings.notifications.items.aiFailures.label', { ns: 'portal' }),
      desc: t('settings.notifications.items.aiFailures.description', { ns: 'portal' }),
    },
    {
      key: 'significant_item_price_increase_alerts' as const,
      label: t('settings.notifications.items.itemPriceIncrease.label', { ns: 'portal' }),
      desc: t('settings.notifications.items.itemPriceIncrease.description', { ns: 'portal' }),
    },
    {
      key: 'recurring_purchase_due_alerts' as const,
      label: t('settings.notifications.items.itemDueSoon.label', { ns: 'portal' }),
      desc: t('settings.notifications.items.itemDueSoon.description', { ns: 'portal' }),
    },
    {
      key: 'duplicate_receipt_warning_alerts' as const,
      label: t('settings.notifications.items.duplicateReceipt.label', { ns: 'portal' }),
      desc: t('settings.notifications.items.duplicateReceipt.description', { ns: 'portal' }),
    },
    {
      key: 'unusual_receipt_total_alerts' as const,
      label: t('settings.notifications.items.unusualReceipt.label', { ns: 'portal' }),
      desc: t('settings.notifications.items.unusualReceipt.description', { ns: 'portal' }),
    },
    {
      key: 'high_item_or_category_spend_alerts' as const,
      label: t('settings.notifications.items.highItemSpend.label', { ns: 'portal' }),
      desc: t('settings.notifications.items.highItemSpend.description', { ns: 'portal' }),
    },
  ];

  const subscriptionPriceText = typeof subscriptionSummary?.priceAmount === 'number' && subscriptionSummary.priceAmount > 0
    ? formatPlatformBillingAmount(subscriptionSummary.priceAmount, {
        currencyCode: subscriptionSummary.currencyCode,
        locale,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
    : null;

  return (
    <AppLayout activeRoute="/settings">
      <div className="page-section page-shell-readable">
        <PageHeader
          title={t('settings.title', { ns: 'portal' })}
          description={t('settings.description', { ns: 'portal' })}
          badge={<StatusBadge status="info" label={t('settings.badge', { ns: 'portal' })} />}
        />

        {/* Tabs */}
        <Tabs items={TABS} activeId={activeTab} onChange={setActiveTab} />

        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <SectionCard
              title={t('settings.profile.title', { ns: 'portal' })}
              description={t('settings.profile.description', { ns: 'portal' })}
            >
              <div className="space-y-4">
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">{t('settings.profile.fullName', { ns: 'portal' })}</label>
                <input
                  type="text"
                  className={`input-base ${errors.full_name ? 'input-error' : ''}`}
                  {...register('full_name', { required: t('settings.profile.errors.fullNameRequired', { ns: 'portal' }) })}
                />
                {errors.full_name && <p className="mt-1.5 text-xs text-negative font-500">{errors.full_name.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">{t('settings.profile.email', { ns: 'portal' })}</label>
                <input type="email" className="input-base opacity-60" value={user?.email || ''} disabled />
                <p className="text-xs text-muted-foreground mt-1">{t('settings.profile.emailHelper', { ns: 'portal' })}</p>
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">{t('settings.profile.country', { ns: 'portal' })}</label>
                <CountrySelector
                  value={selectedCountry}
                  onChange={(countryCode) => setValue('country', countryCode, { shouldDirty: true })}
                  placeholder={t('settings.profile.countryPlaceholder', { ns: 'portal' })}
                />
                <input type="hidden" {...register('country')} />
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">{t('settings.profile.monthlyIncome', { ns: 'portal' })}</label>
                <input type="number" step="0.01" min="0" className="input-base font-tabular" placeholder={t('settings.profile.monthlyIncomePlaceholder', { ns: 'portal' })} {...register('monthly_income')} />
              </div>
              </div>
            </SectionCard>
          )}

          {/* Preferences Tab */}
          {activeTab === 'preferences' && (
            <SectionCard
              title={t('settings.preferences.title', { ns: 'portal' })}
              description={t('settings.preferences.description', { ns: 'portal' })}
            >
              <div className="space-y-4">
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">{t('settings.preferences.language', { ns: 'portal' })}</label>
                <select className="input-base" {...register('preferred_language')}>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">{t('settings.preferences.defaultCurrency', { ns: 'portal' })}</label>
                {selectedCountryRecord && recommendedCurrency ? (
                  <div className="mb-2 rounded-xl border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-foreground">
                    <p>
                      {t('settings.preferences.recommendedCurrency', {
                        ns: 'portal',
                        country: selectedCountryRecord.name,
                        currency: recommendedCurrency.name,
                        code: recommendedCurrency.code,
                      })}
                    </p>
                    {selectedCurrency !== recommendedCurrency.code ? (
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setValue('default_currency', recommendedCurrency.code, { shouldDirty: true })}
                          className="btn-secondary text-xs"
                        >
                          {t('settings.preferences.useRecommended', {
                            ns: 'portal',
                            code: recommendedCurrency.code,
                          })}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <CurrencySelector
                  value={selectedCurrency}
                  onChange={(currencyCode) => {
                    setValue('default_currency', currencyCode, { shouldDirty: true });
                  }}
                  showCountryCount
                  placeholder={t('settings.preferences.defaultCurrencyPlaceholder', { ns: 'portal' })}
                />
                <input type="hidden" {...register('default_currency')} />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t('settings.preferences.reportingCurrencyHelper', {
                    ns: 'portal',
                    defaultValue: 'Used for dashboard totals, reports, and as the default for new accounts.',
                  })}
                </p>
                {selectedCurrencyRecord && !selectedCurrencyRecord.isActive ? (
                  <p className="mt-1.5 text-xs text-warning">
                    {t('settings.preferences.inactiveCurrency', { ns: 'portal' })}
                  </p>
                ) : null}
              </div>
              <input type="hidden" {...register('month_start_day')} />
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                {t('settings.preferences.legacyMonthStartHelper', { ns: 'portal' })}
              </div>
              </div>
            </SectionCard>
          )}

          {activeTab === 'planning' && (
            <SectionCard
              title={t('settings.planning.title', { ns: 'portal' })}
              description={t('settings.planning.description', { ns: 'portal' })}
            >
              <div className="space-y-5">
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
                <PlanningPreferencesFields
                  values={financialPeriodValues}
                  errors={financialPeriodErrors}
                  onChange={setFinancialField}
                  showCompatibilityNote
                />
              </div>
            </SectionCard>
          )}

          {activeTab === 'subscription' && (
            <SectionCard
              title={t('settings.subscription.title', { ns: 'portal' })}
              description={t('settings.subscription.description', { ns: 'portal' })}
              action={
                <Link href="/settings/subscription" className="btn-secondary text-sm">
                  {t('settings.subscription.manageAction', { ns: 'portal' })}
                </Link>
              }
            >
              <div className="space-y-4">
                {subscriptionLoading ? (
                  <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
                    {t('status.loading', { ns: 'common' })}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-border p-4">
                      <p className="text-xs font-700 uppercase tracking-wider text-muted-foreground">
                        {t('settings.subscription.currentPlan', { ns: 'portal' })}
                      </p>
                      <p className="mt-2 text-base font-700 text-foreground">
                        {subscriptionSummary?.planName || t('settings.subscription.noPlan', { ns: 'portal' })}
                      </p>
                      {subscriptionSummary?.billingInterval ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t(`subscriptionBilling.intervals.${subscriptionSummary.billingInterval}`, { ns: 'portal' })}
                        </p>
                      ) : null}
                    </div>
                    <div className="rounded-xl border border-border p-4">
                      <p className="text-xs font-700 uppercase tracking-wider text-muted-foreground">
                        {t('settings.subscription.status', { ns: 'portal' })}
                      </p>
                      <p className="mt-2 text-base font-700 text-foreground">
                        {subscriptionSummary?.status
                          ? t(`subscriptionBilling.status.${subscriptionSummary.status === 'past_due' ? 'pastDue' : subscriptionSummary.status}`, { ns: 'portal' })
                          : t('status.inactive', { ns: 'common' })}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border p-4">
                      <p className="text-xs font-700 uppercase tracking-wider text-muted-foreground">
                        {t('settings.subscription.renewalDate', { ns: 'portal' })}
                      </p>
                      <p className="mt-2 text-sm font-700 text-foreground">
                        {subscriptionSummary?.currentPeriodEnd
                          ? new Intl.DateTimeFormat(locale, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            }).format(new Date(subscriptionSummary.currentPeriodEnd))
                          : t('settings.subscription.notAvailable', { ns: 'portal' })}
                      </p>
                      {subscriptionPriceText ? (
                        <p className="mt-1 text-sm text-muted-foreground">{subscriptionPriceText}</p>
                      ) : null}
                    </div>
                    <div className="rounded-xl border border-border p-4">
                      <p className="text-xs font-700 uppercase tracking-wider text-muted-foreground">
                        {t('settings.subscription.manage', { ns: 'portal' })}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Link href="/settings/subscription" className="btn-primary text-sm">
                          {t('settings.subscription.manageSubscription', { ns: 'portal' })}
                        </Link>
                        <Link href="/settings/subscription" className="btn-secondary text-sm">
                          {t('settings.subscription.upgradeAction', { ns: 'portal' })}
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <SectionCard title={t('settings.security.title', { ns: 'portal' })} description={t('settings.security.description', { ns: 'portal' })}>
              <div className="space-y-4">
              <div className="p-4 rounded-xl bg-muted/40 border border-border">
                <p className="text-sm font-600 text-foreground mb-1">{t('settings.security.changePasswordTitle', { ns: 'portal' })}</p>
                <p className="text-xs text-muted-foreground mb-3">{t('settings.security.changePasswordDescription', { ns: 'portal' })}</p>
                <button
                  type="button"
                  onClick={async () => {
                    const supabase = createClient();
                    await supabase.auth.resetPasswordForEmail(user?.email || '', {
                      redirectTo: buildPasswordResetUrl(),
                    });
                    toast.success(t('settings.security.resetEmailSent', { ns: 'portal' }));
                  }}
                  className="btn-secondary text-sm"
                >
                  {t('settings.security.sendResetEmail', { ns: 'portal' })}
                </button>
              </div>
              <div className="p-4 rounded-xl bg-negative-soft/30 border border-negative/20">
                <p className="text-sm font-600 text-negative mb-1">{t('settings.security.deleteAccountTitle', { ns: 'portal' })}</p>
                <p className="text-xs text-muted-foreground mb-3">{t('settings.security.deleteAccountDescription', { ns: 'portal' })}</p>
                <button type="button" onClick={() => toast.error(t('settings.security.deleteAccountSupportOnly', { ns: 'portal' }))} className="btn-secondary text-sm text-negative border-negative/30">
                  {t('settings.security.requestDeletion', { ns: 'portal' })}
                </button>
              </div>
              </div>
            </SectionCard>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <SectionCard title={t('settings.notifications.title', { ns: 'portal' })} description={t('settings.notifications.description', { ns: 'portal' })}>
              <div className="space-y-4">
              {notificationsLoading ? (
                <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
                  {t('settings.notifications.loading', { ns: 'portal' })}
                </div>
              ) : notificationsError ? (
                <div className="rounded-xl border border-warning/30 bg-warning-soft/20 p-4">
                  <p className="text-sm font-600 text-foreground">{t('settings.notifications.loadFailedTitle', { ns: 'portal' })}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{notificationsError}</p>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void loadNotificationPreferences()}
                      className="btn-secondary text-sm"
                    >
                      {t('actions.refresh', { ns: 'common' })}
                    </button>
                  </div>
                </div>
              ) : (
                notificationItems.map((item) => {
                  const enabled = Boolean(notificationPreferences[item.key]);
                  return (
                    <div key={item.key} className="flex items-start gap-3 rounded-xl border border-border p-3 sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-600 text-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                      <div className="shrink-0 pt-0.5 sm:pt-0">
                        <button
                          type="button"
                          onClick={() => toggleNotificationPreference(item.key)}
                          className={`relative inline-flex h-6 w-11 shrink-0 overflow-hidden rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                            enabled ? 'bg-accent' : 'bg-muted'
                          }`}
                          aria-label={t('settings.notifications.toggle', { ns: 'portal', label: item.label })}
                          aria-pressed={enabled}
                        >
                          <span
                            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
                              enabled
                                ? (isRTL ? 'left-0.5' : 'left-[1.375rem]')
                                : (isRTL ? 'left-[1.375rem]' : 'left-0.5')
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void saveNotifications()}
                  disabled={notificationsLoading || notificationsSaving}
                  className="btn-primary"
                >
                  {notificationsSaving ? <><Loader2 size={15} className="animate-spin" />{t('status.saving', { ns: 'common' })}</> : t('settings.notifications.saveAction', { ns: 'portal' })}
                </button>
              </div>
              </div>
            </SectionCard>
          )}

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

          {(activeTab === 'profile' || activeTab === 'preferences' || activeTab === 'planning') && (
            <div className="flex justify-end mt-4">
              <button type="submit" disabled={isSaving} className={`btn-primary ${saved ? 'bg-positive' : ''}`}>
                {isSaving ? <><Loader2 size={15} className="animate-spin" />{t('status.saving', { ns: 'common' })}</> : saved ? <><Check size={15} />{t('settings.savedShort', { ns: 'portal' })}</> : t('settings.saveAction', { ns: 'portal' })}
              </button>
            </div>
          )}
        </form>
        <ReportingCurrencyWizard
          isOpen={showReportingCurrencyWizard && Boolean(pendingProfileData)}
          currentReportingCurrency={(savedDefaultCurrency || '').trim().toUpperCase()}
          newReportingCurrency={(pendingProfileData?.default_currency || '').trim().toUpperCase()}
          onClose={() => {
            setShowReportingCurrencyWizard(false);
            setPendingProfileData(null);
          }}
          onApplied={async (result) => {
            const nextPendingProfile = pendingProfileData;
            setSavedDefaultCurrency(result.newReportingCurrency);
            if (nextPendingProfile) {
              await persistProfile(nextPendingProfile, {
                suppressSuccessToast: true,
                preserveReportingCurrencyWizard: true,
              });
            }
          }}
        />
      </div>
    </AppLayout>
  );
}
