'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { Settings, User, Globe, Bell, Shield, Check, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import Icon from '@/components/ui/AppIcon';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import Tabs from '@/components/ui/Tabs';
import StatusBadge from '@/components/ui/StatusBadge';
import CountrySelector from '@/components/country/CountrySelector';
import CurrencySelector from '@/components/CurrencySelector';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { getCountryByCode, getCurrencyByCode, getDefaultCurrencyForCountry } from '@/lib/reference-data/lookups';
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
}

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية' },
  { code: 'fr', name: 'Français' },
  { code: 'ru', name: 'Русский' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [currencyManuallySelected, setCurrencyManuallySelected] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsSaving, setNotificationsSaving] = useState(false);
  const { user } = useAuth();
  const { setLanguage } = useLanguage();
  const router = useRouter();
  const { data: referenceData } = useClientReferenceData();
  const snapshot = referenceData?.snapshot;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProfileFormData>({
    defaultValues: {
      full_name: '',
      country: '',
      monthly_income: '',
      month_start_day: '1',
      default_currency: referenceData?.platformDefaultCurrency || '',
      preferred_language: 'en',
    },
  });

  const selectedCountry = watch('country');
  const selectedCurrency = watch('default_currency');
  const selectedCountryRecord = getCountryByCode(snapshot?.countries ?? [], selectedCountry);
  const recommendedCurrency = snapshot ? getDefaultCurrencyForCountry(snapshot, selectedCountry) : null;
  const selectedCurrencyRecord = getCurrencyByCode(snapshot?.currencies ?? [], selectedCurrency);

  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      const supabase = createClient();
      const { data } = await supabase.from('user_profiles').select('*').eq('id', user.id).single();
      if (data) {
        reset({
          full_name: data.full_name || '',
          country: data.country || '',
          monthly_income: data.monthly_income?.toString() || '',
          month_start_day: data.month_start_day?.toString() || '1',
          default_currency: data.default_currency || referenceData?.platformDefaultCurrency || '',
          preferred_language: data.preferred_language || 'en',
        });
        setCurrencyManuallySelected(false);
      }
    };
    loadProfile();
  }, [referenceData?.platformDefaultCurrency, reset, user]);

  useEffect(() => {
    if (!recommendedCurrency || currencyManuallySelected) return;
    setValue('default_currency', recommendedCurrency.code);
  }, [currencyManuallySelected, recommendedCurrency, setValue]);

  useEffect(() => {
    if (!user) return;

    const loadNotificationPreferences = async () => {
      setNotificationsLoading(true);
      try {
        const prefs = await getNotificationPreferences();
        setNotificationPreferences(prefs);
      } catch (error: any) {
        toast.error(error?.message || 'Failed to load notification settings');
      } finally {
        setNotificationsLoading(false);
      }
    };

    void loadNotificationPreferences();
  }, [user]);

  const onSubmit = async (data: ProfileFormData) => {
    if (!user) return;
    setIsSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('user_profiles').update({
        full_name: data.full_name,
        country: data.country,
        monthly_income: data.monthly_income ? parseFloat(data.monthly_income) : null,
        month_start_day: parseInt(data.month_start_day),
        default_currency: data.default_currency,
        preferred_language: data.preferred_language,
      }).eq('id', user.id);
      if (error) throw error;
      setLanguage(data.preferred_language as any);
      reset(data);
      setSaved(true);
      toast.success('Settings saved successfully');
      router.refresh();
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
                  <p className="mb-2 rounded-xl border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-foreground">
                    Recommended for {selectedCountryRecord.name}: {recommendedCurrency.name} ({recommendedCurrency.code})
                  </p>
                ) : null}
                <CurrencySelector
                  value={selectedCurrency}
                  onChange={(currencyCode) => {
                    setCurrencyManuallySelected(true);
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

          {(activeTab === 'profile' || activeTab === 'preferences') && (
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
