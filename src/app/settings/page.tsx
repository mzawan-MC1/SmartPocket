'use client';
import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { Settings, User, Globe, Bell, Shield, Check, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { CURRENCY_REGISTRY } from '@/lib/currency';
import { useLanguage } from '@/contexts/LanguageContext';
import Icon from '@/components/ui/AppIcon';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import Tabs from '@/components/ui/Tabs';
import StatusBadge from '@/components/ui/StatusBadge';


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
  const { user } = useAuth();
  const { setLanguage } = useLanguage();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProfileFormData>();

  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      const supabase = createClient();
      const { data } = await supabase.from('user_profiles').select('*').eq('id', user.id).single();
      if (data) {
        reset({
          full_name: data.full_name || '',
          country: data.country || 'AE',
          monthly_income: data.monthly_income?.toString() || '',
          month_start_day: data.month_start_day?.toString() || '1',
          default_currency: data.default_currency || 'AED',
          preferred_language: data.preferred_language || 'en',
        });
      }
    };
    loadProfile();
  }, [user, reset]);

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
      setSaved(true);
      toast.success('Settings saved successfully');
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
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
                <input type="text" className="input-base" placeholder="e.g. AE, US, GB" {...register('country')} />
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
                <select className="input-base" {...register('default_currency')}>
                  {Object.values(CURRENCY_REGISTRY).map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </select>
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
              {[
                { label: 'Budget alerts', desc: 'Notify when spending reaches alert threshold' },
                { label: 'Upcoming payments', desc: 'Remind me 3 days before recurring payments' },
                { label: 'Weekly summary', desc: 'Weekly email with spending overview' },
                { label: 'Security alerts', desc: 'Notify on new sign-ins and password changes' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between p-3 rounded-xl border border-border">
                  <div>
                    <p className="text-sm font-600 text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toast.info('Notification settings require email configuration')}
                    className="relative w-10 h-5 rounded-full bg-muted cursor-pointer"
                    aria-label={`Toggle ${item.label}`}
                  >
                    <span className="absolute top-0.5 start-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200" />
                  </button>
                </div>
              ))}
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
