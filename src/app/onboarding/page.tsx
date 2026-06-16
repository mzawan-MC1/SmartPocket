'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Loader2, ChevronRight, ChevronLeft, CheckCircle2, Globe, DollarSign, User, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import AppLogo from '@/components/ui/AppLogo';
import { CURRENCY_REGISTRY } from '@/lib/currency';

const STEPS = [
  { id: 1, title: 'Welcome', icon: User },
  { id: 2, title: 'Language & Region', icon: Globe },
  { id: 3, title: 'Currency', icon: DollarSign },
  { id: 4, title: 'Income', icon: TrendingUp },
];

interface OnboardingData {
  fullName: string;
  country: string;
  preferredLanguage: string;
  defaultCurrency: string;
  monthlyIncome: string;
  monthStartDay: string;
}

const COUNTRIES = [
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IN', name: 'India' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'FR', name: 'France' },
  { code: 'RU', name: 'Russia' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'Other', name: 'Other' },
];

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'ar', name: 'العربية', flag: '🇦🇪' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<OnboardingData>({
    defaultValues: {
      fullName: '',
      country: 'AE',
      preferredLanguage: 'en',
      defaultCurrency: 'AED',
      monthlyIncome: '',
      monthStartDay: '1',
    },
  });

  const selectedLanguage = watch('preferredLanguage');
  const selectedCurrency = watch('defaultCurrency');
  const currencies = Object.values(CURRENCY_REGISTRY);

  const onFinish = async (data: OnboardingData) => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      const currentUser = authUser ?? user;
      if (!currentUser) {
        throw new Error('Your session expired. Please sign in again.');
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
        })
        .eq('id', currentUser.id);
      if (error) throw error;
      toast.success('Profile set up! Welcome to Smart Pocket.');
      router.replace('/dashboard');
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save preferences.');
    } finally {
      setIsLoading(false);
    }
  };

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8 bg-[radial-gradient(circle_at_top_right,rgba(15,159,152,0.08),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(16,59,99,0.08),transparent_35%)]">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <AppLogo size={48} className="mx-auto mb-3" />
          <h1 className="text-3xl font-800 text-foreground">Set up Smart Pocket</h1>
          <p className="text-base text-muted-foreground mt-2">Just a few quick steps to personalize your experience and dashboard defaults.</p>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((s) => (
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
                  <h2 className="text-lg font-700 text-foreground mb-1">What should we call you?</h2>
                  <p className="text-sm text-muted-foreground">This will appear in your dashboard greeting</p>
                </div>
                <div>
                  <label htmlFor="ob-name" className="block text-sm font-600 text-foreground mb-1.5">Full name</label>
                  <input
                    id="ob-name"
                    type="text"
                    autoComplete="name"
                    className={`input-base ${errors.fullName ? 'input-error' : ''}`}
                    placeholder="Your full name"
                    {...register('fullName', { required: 'Please enter your name' })}
                  />
                  {errors.fullName && <p className="mt-1.5 text-xs text-negative font-500">{errors.fullName.message}</p>}
                </div>
                <div>
                  <label htmlFor="ob-country" className="block text-sm font-600 text-foreground mb-1.5">Country</label>
                  <select id="ob-country" className="input-base" {...register('country')}>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Step 2: Language */}
            {step === 2 && (
              <div className="space-y-5 fade-in">
                <div>
                  <h2 className="text-lg font-700 text-foreground mb-1">Choose your language</h2>
                  <p className="text-sm text-muted-foreground">Smart Pocket supports 4 languages including Arabic RTL</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {LANGUAGES.map((lang) => (
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
                  <h2 className="text-lg font-700 text-foreground mb-1">Default currency</h2>
                  <p className="text-sm text-muted-foreground">Used for all amounts and reports</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto scrollbar-thin">
                  {currencies.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => setValue('defaultCurrency', c.code)}
                      className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm transition-all ${
                        selectedCurrency === c.code
                          ? 'border-accent bg-accent/5 text-accent' :'border-border hover:border-accent/40 text-foreground'
                      }`}
                    >
                      <span className="font-700 w-8 text-center">{c.code === 'AED' ? 'AED' : c.symbol}</span>
                      <span className="font-600 truncate">{c.code}</span>
                      {selectedCurrency === c.code && <CheckCircle2 size={12} className="ms-auto flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 4: Income */}
            {step === 4 && (
              <div className="space-y-5 fade-in">
                <div>
                  <h2 className="text-lg font-700 text-foreground mb-1">Monthly income (optional)</h2>
                  <p className="text-sm text-muted-foreground">Helps calculate savings rate and budget recommendations</p>
                </div>
                <div>
                  <label htmlFor="ob-income" className="block text-sm font-600 text-foreground mb-1.5">
                    Monthly income
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-600">
                      {selectedCurrency}
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
                  <p className="text-xs text-muted-foreground mt-1.5">Leave blank to skip — you can set this later in settings</p>
                </div>
                <div>
                  <label htmlFor="ob-month-start" className="block text-sm font-600 text-foreground mb-1.5">
                    Month starts on day
                  </label>
                  <select id="ob-month-start" className="input-base" {...register('monthStartDay')}>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1.5">Used for monthly budget and report calculations</p>
                </div>
              </div>
            )}
            </div>
          </div>

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

            {step < STEPS.length ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="btn-primary"
              >
                Continue
                <ChevronRight size={16} />
              </button>
            ) : (
              <button type="submit" disabled={isLoading} className="btn-primary">
                {isLoading ? (
                  <><Loader2 size={16} className="animate-spin" />Saving...</>
                ) : (
                  <>Get Started <CheckCircle2 size={16} /></>
                )}
              </button>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-4">
            <button type="button" onClick={() => router.replace('/dashboard')} className="hover:text-accent transition-colors">
              Skip for now — set up later in Settings
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
