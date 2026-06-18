'use client';
import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { Settings, User, Globe, Bell, Shield, Check, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import Tabs from '@/components/ui/Tabs';
import StatusBadge from '@/components/ui/StatusBadge';
import CountrySelector from '@/components/country/CountrySelector';
import CurrencySelector from '@/components/CurrencySelector';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { getCountryByCode, getCurrencyByCode, getDefaultCurrencyForCountry } from '@/lib/reference-data/lookups';
import { clearResolvedUserDefaultCurrencyCache } from '@/lib/currency-totals';
import { dispatchSmartPocketDataChanged } from '@/lib/data-change';
import IncomeFrequencySelector from '@/components/financial-periods/IncomeFrequencySelector';
import PayScheduleFields from '@/components/financial-periods/PayScheduleFields';
import PlanningPreferencesFields from '@/components/financial-periods/PlanningPreferencesFields';
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

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية' },
  { code: 'fr', name: 'Français' },
  { code: 'ru', name: 'Русский' },
];

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
  const [activeTab, setActiveTab] = useState('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [financialPeriodErrors, setFinancialPeriodErrors] = useState<FinancialPeriodFieldErrors>({});
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsSaving, setNotificationsSaving] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const { user } = useAuth();
  const { setLanguage } = useLanguage();
  const { data: referenceData } = useClientReferenceData();
  const snapshot = referenceData?.snapshot;
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
        reset({
          full_name: data.full_name || '',
          country: data.country || '',
          monthly_income: data.monthly_income?.toString() || '',
          month_start_day: data.month_start_day?.toString() || '1',
          default_currency: data.default_currency || referenceData?.platformDefaultCurrency || '',
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
      }
    };
    loadProfile();
  }, [referenceData?.platformDefaultCurrency, reset, user]);

  const loadNotificationPreferences = async () => {
    setNotificationsLoading(true);
    setNotificationsError(null);
    try {
      const prefs = await getNotificationPreferences();
      setNotificationPreferences(prefs);
    } catch (error: any) {
      const message = error?.message || 'Failed to load notification settings';
      setNotificationsError(message);
      toast.error(message);
    } finally {
      setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void loadNotificationPreferences();
  }, [user]);

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

  const onSubmit = async (data: ProfileFormData) => {
    if (!user) return;
    setIsSaving(true);
    try {
      const planningValues = buildPlanningValues(getValues());
      const validation = validateFinancialPeriodForm(planningValues);
      if (!validation.isValid) {
        setFinancialPeriodErrors(validation.fieldErrors);
        toast.error(validation.errors[0] || 'Please review your income and planning schedule.');
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
      setLanguage((savedProfile.preferred_language || 'en') as any);
      clearResolvedUserDefaultCurrencyCache();
      clearFinancialPeriodProfileCache();
      reset({
        full_name: savedProfile.full_name || '',
        country: savedProfile.country || '',
        monthly_income: savedProfile.monthly_income?.toString() || '',
        month_start_day: savedProfile.month_start_day?.toString() || '1',
        default_currency: savedProfile.default_currency || referenceData?.platformDefaultCurrency || '',
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
      dispatchSmartPocketDataChanged({
        source: 'SettingsPage',
        entities: ['profile', 'dashboard', 'transactions', 'financial_accounts', 'recurring_transactions'],
      });
      setSaved(true);
      toast.success('Settings saved successfully');
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
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
      toast.success('Notification settings saved successfully');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save notification settings');
    } finally {
      setNotificationsSaving(false);
    }
  };

  const TABS = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'preferences', label: 'Preferences', icon: Globe },
    { id: 'planning', label: 'Income & Planning', icon: Settings },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  return (
    <AppLayout activeRoute="/settings">
      <div className="page-section page-shell-readable">
        <PageHeader
          title="Settings"
          description="Manage your profile, language, currency, security preferences, and account support actions."
          badge={<StatusBadge status="info" label="Account settings" />}
        />

        {/* Tabs */}
        <Tabs items={TABS} activeId={activeTab} onChange={setActiveTab} />

        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <SectionCard title="Profile Information" description="Update your name, country, and income preferences.">
              <div className="space-y-4">
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">Full name</label>
                <input type="text" className={`input-base ${errors.full_name ? 'input-error' : ''}`} {...register('full_name', { required: 'Name is required' })} />
                {errors.full_name && <p className="mt-1.5 text-xs text-negative font-500">{errors.full_name.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">Email address</label>
                <input type="email" className="input-base opacity-60" value={user?.email || ''} disabled />
                <p className="text-xs text-muted-foreground mt-1">Email cannot be changed here. Contact support if needed.</p>
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">Country</label>
                <CountrySelector
                  value={selectedCountry}
                  onChange={(countryCode) => setValue('country', countryCode, { shouldDirty: true })}
                  placeholder="Choose your country"
                />
                <input type="hidden" {...register('country')} />
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">Monthly income (optional)</label>
                <input type="number" step="0.01" min="0" className="input-base font-tabular" placeholder="0.00" {...register('monthly_income')} />
              </div>
              </div>
            </SectionCard>
          )}

          {/* Preferences Tab */}
          {activeTab === 'preferences' && (
            <SectionCard title="Language & Currency" description="Choose the defaults used throughout Smart Pocket.">
              <div className="space-y-4">
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">Language</label>
                <select className="input-base" {...register('preferred_language')}>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">Default currency</label>
                {selectedCountryRecord && recommendedCurrency ? (
                  <div className="mb-2 rounded-xl border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-foreground">
                    <p>
                      Recommended for {selectedCountryRecord.name}: {recommendedCurrency.name} ({recommendedCurrency.code})
                    </p>
                    {selectedCurrency !== recommendedCurrency.code ? (
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setValue('default_currency', recommendedCurrency.code, { shouldDirty: true })}
                          className="btn-secondary text-xs"
                        >
                          Use recommended {recommendedCurrency.code}
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
                  placeholder="Choose your default currency"
                />
                <input type="hidden" {...register('default_currency')} />
                {selectedCurrencyRecord && !selectedCurrencyRecord.isActive ? (
                  <p className="mt-1.5 text-xs text-warning">
                    This saved currency is inactive and is kept for compatibility.
                  </p>
                ) : null}
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">Month starts on day</label>
                <select className="input-base w-24" {...register('month_start_day')}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              </div>
            </SectionCard>
          )}

          {activeTab === 'planning' && (
            <SectionCard
              title="Income & Planning Schedule"
              description="Manage your income rhythm, planning defaults, week start, and timezone without changing existing transactions or budgets."
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

          {/* Security Tab */}
          {activeTab === 'security' && (
            <SectionCard title="Security" description="Password resets and account lifecycle actions.">
              <div className="space-y-4">
              <div className="p-4 rounded-xl bg-muted/40 border border-border">
                <p className="text-sm font-600 text-foreground mb-1">Change Password</p>
                <p className="text-xs text-muted-foreground mb-3">We will send a password reset link to your email address.</p>
                <button
                  type="button"
                  onClick={async () => {
                    const supabase = createClient();
                    await supabase.auth.resetPasswordForEmail(user?.email || '', {
                      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`,
                    });
                    toast.success('Password reset email sent!');
                  }}
                  className="btn-secondary text-sm"
                >
                  Send Reset Email
                </button>
              </div>
              <div className="p-4 rounded-xl bg-negative-soft/30 border border-negative/20">
                <p className="text-sm font-600 text-negative mb-1">Delete Account</p>
                <p className="text-xs text-muted-foreground mb-3">Permanently delete your account and all data. This cannot be undone.</p>
                <button type="button" onClick={() => toast.error('Account deletion requires contacting support.')} className="btn-secondary text-sm text-negative border-negative/30">
                  Request Account Deletion
                </button>
              </div>
              </div>
            </SectionCard>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <SectionCard title="Notification Preferences" description="Manage alert types and weekly summaries.">
              <div className="space-y-4">
              {notificationsLoading ? (
                <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
                  Loading notification settings...
                </div>
              ) : notificationsError ? (
                <div className="rounded-xl border border-warning/30 bg-warning-soft/20 p-4">
                  <p className="text-sm font-600 text-foreground">Notification settings could not be loaded.</p>
                  <p className="mt-1 text-xs text-muted-foreground">{notificationsError}</p>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void loadNotificationPreferences()}
                      className="btn-secondary text-sm"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ) : (
                [
                  {
                    key: 'in_app_enabled' as const,
                    label: 'In-app notifications',
                    desc: 'Show notifications in the bell menu across the app.',
                  },
                  {
                    key: 'recurring_due_reminders' as const,
                    label: 'Recurring payment reminders',
                    desc: 'Create reminders when recurring expense payments are due soon.',
                  },
                  {
                    key: 'budget_alerts' as const,
                    label: 'Budget alerts',
                    desc: 'Notify when spending reaches the saved alert threshold for active budgets.',
                  },
                  {
                    key: 'reimbursement_updates' as const,
                    label: 'Reimbursements and settlements',
                    desc: 'Notify when reimbursements or settlements are created or updated.',
                  },
                  {
                    key: 'account_security_notifications' as const,
                    label: 'Account and security notifications',
                    desc: 'Notify about important account access events.',
                  },
                  {
                    key: 'ai_execution_failure_notifications' as const,
                    label: 'AI execution failures',
                    desc: 'Notify when Smart Entry cannot save confirmed records.',
                  },
                ].map((item) => {
                  const enabled = Boolean(notificationPreferences[item.key]);
                  return (
                    <div key={item.key} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border">
                      <div>
                        <p className="text-sm font-600 text-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleNotificationPreference(item.key)}
                        className={`relative h-5 w-10 rounded-full transition-colors ${
                          enabled ? 'bg-accent' : 'bg-muted'
                        }`}
                        aria-label={`Toggle ${item.label}`}
                        aria-pressed={enabled}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${
                            enabled ? 'start-5' : 'start-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  );
                })
              )}
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                Email and browser push notifications are not implemented yet, so they are not shown as active settings.
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void saveNotifications()}
                  disabled={notificationsLoading || notificationsSaving}
                  className="btn-primary"
                >
                  {notificationsSaving ? <><Loader2 size={15} className="animate-spin" />Saving...</> : 'Save Notification Settings'}
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
                {isSaving ? <><Loader2 size={15} className="animate-spin" />Saving...</> : saved ? <><Check size={15} />Saved</> : 'Save Changes'}
              </button>
            </div>
          )}
        </form>
      </div>
    </AppLayout>
  );
}
