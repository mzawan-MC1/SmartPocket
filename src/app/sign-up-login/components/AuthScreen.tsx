'use client';
import React, { Suspense, useCallback } from 'react';
import LoginForm from './LoginForm';
import SignUpForm from './SignUpForm';
import ForgotPasswordForm from './ForgotPasswordForm';
import AppLogo from '@/components/ui/AppLogo';
import { ShieldCheck, TrendingUp, PieChart, BarChart3 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';
import { getSettingsAssetUrl } from '@/lib/platform-settings';
import { useLanguage } from '@/contexts/LanguageContext';


type AuthMode = 'login' | 'signup' | 'forgot';

export default function AuthScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation(['auth', 'public']);
  const { language } = useLanguage();
  const { branding, updatedAt, auth } = usePlatformSettings();
  const year = new Date().getFullYear();
  const faviconSrc = getSettingsAssetUrl(branding.faviconUrl, updatedAt);
  const requestedMode = searchParams.get('mode');
  const mode: AuthMode =
    requestedMode === 'signup'
      ? 'signup'
      : requestedMode === 'forgot' && auth.emailPasswordEnabled
        ? 'forgot'
        : 'login';
  const hasOauthProviders = auth.googleOauthEnabled || auth.appleOauthEnabled;
  const hasAnyAuthMethod =
    auth.emailPasswordEnabled ||
    auth.googleOauthEnabled ||
    auth.appleOauthEnabled ||
    auth.magicLinkEnabled;
  const showSingleLanguageBrandingTagline = language === 'en';
  const brandHeadline = showSingleLanguageBrandingTagline && branding.tagline
    ? branding.tagline
    : t('authScreen.brandHeadline', { ns: 'public', defaultValue: branding.appName });

  const setMode = useCallback((nextMode: AuthMode) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('mode', nextMode);
    const query = params.toString();
    router.replace(query ? `/sign-up-login?${query}` : '/sign-up-login', { scroll: false });
  }, [router, searchParams]);

  const features = [
    { id: 'feat-track', icon: TrendingUp, text: t('authScreen.featureTrack', { ns: 'public' }) },
    { id: 'feat-budget', icon: PieChart, text: t('authScreen.featureBudget', { ns: 'public' }) },
    { id: 'feat-reports', icon: BarChart3, text: t('authScreen.featureReports', { ns: 'public' }) },
    { id: 'feat-secure', icon: ShieldCheck, text: t('authScreen.featureSecurity', { ns: 'public' }) },
  ];

  return (
    <div className="flex flex-1 min-h-0 bg-[radial-gradient(circle_at_top_right,rgba(15,159,152,0.08),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(16,59,99,0.08),transparent_35%)]">
      {/* Left Brand Panel */}
      <div className="hidden lg:flex lg:w-[46%] xl:w-[42%] gradient-navy flex-col justify-between p-10 xl:p-14 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white opacity-5" />
          <div className="absolute bottom-20 -left-10 w-60 h-60 rounded-full bg-teal-400 opacity-10" />
          <div className="absolute top-1/2 right-10 w-32 h-32 rounded-full bg-mint opacity-5" />
        </div>

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-white/10">
              <AppLogo
                src={faviconSrc}
                width={28}
                height={28}
                alt={`${branding.appName} icon`}
                imageClassName="h-7 w-7"
              />
            </div>
            <span className="text-white text-xl font-700 tracking-tight">{branding.appName}</span>
          </div>
        </div>

        <div className="relative space-y-6">
          <div className="max-w-xl">
            <h2 className="text-4xl xl:text-5xl font-800 text-white leading-[1.05] text-balance">
              {brandHeadline}
            </h2>
            <p className="text-white/78 mt-4 text-lg leading-relaxed">
              {t('authScreen.brandSubtitle', { ns: 'public' })}
            </p>
          </div>

          <div className="space-y-4">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    <Icon size={16} className="text-mint" />
                  </div>
                  <p className="text-white/85 text-sm">{f.text}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative">
          <p className="text-white/40 text-xs">
            © {year} {branding.appName}. {t('authScreen.footerNote', { ns: 'public' })}
          </p>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 overflow-y-auto">
        {/* Mobile logo */}
        <div className="w-full max-w-[400px] flex justify-start items-center mb-6 lg:hidden">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card">
              <AppLogo
                src={faviconSrc}
                width={28}
                height={28}
                alt={`${branding.appName} icon`}
                imageClassName="h-7 w-7"
              />
            </div>
            <div className="min-w-0">
              <span className="block font-700 text-lg text-primary">{branding.appName}</span>
              {showSingleLanguageBrandingTagline && branding.tagline ? (
                <span className="block text-xs text-muted-foreground">{branding.tagline}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="w-full max-w-[460px] rounded-[28px] border border-border bg-card/95 p-5 sm:p-7 shadow-card-lg">
          <Suspense fallback={<div className="w-full h-64 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-accent border-t-transparent animate-spin" /></div>}>
            {!hasAnyAuthMethod ? (
              <div className="py-10 text-center">
                <h1 className="text-2xl font-700 text-foreground tracking-tight">{t('authScreen.unavailableTitle', { ns: 'public' })}</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('authScreen.unavailableDescription', { ns: 'public' })}
                </p>
              </div>
            ) : mode === 'login' ? (
              <LoginForm
                onSwitchToSignUp={() => setMode('signup')}
                onForgotPassword={() => setMode('forgot')}
                showGoogle={auth.googleOauthEnabled}
                showApple={auth.appleOauthEnabled}
                showMagicLink={auth.magicLinkEnabled}
                showEmailPassword={auth.emailPasswordEnabled}
              />
            ) : mode === 'signup' ? (
              <SignUpForm
                onSwitchToLogin={() => setMode('login')}
                showGoogle={auth.googleOauthEnabled}
                showApple={auth.appleOauthEnabled}
                showMagicLink={auth.magicLinkEnabled}
                showEmailPassword={auth.emailPasswordEnabled}
              />
            ) : (
              <ForgotPasswordForm onBack={() => setMode('login')} />
            )}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
