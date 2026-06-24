'use client';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Loader2, Globe, Apple } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { createClient } from '@/lib/supabase/client';
import { trackMarketingEvent } from '@/lib/analytics';
import { getSafeNextPath } from '@/lib/auth/redirects';
import { buildAuthCallbackUrl } from '@/lib/auth/urls';

interface LoginFormData {
  email: string;
  password: string;
  rememberMe: boolean;
}

interface LoginFormProps {
  onSwitchToSignUp: () => void;
  onForgotPassword: () => void;
  showGoogle: boolean;
  showApple: boolean;
  showMagicLink: boolean;
  showEmailPassword: boolean;
}

export default function LoginForm({
  onSwitchToSignUp,
  onForgotPassword,
  showGoogle,
  showApple,
  showMagicLink,
  showEmailPassword,
}: LoginFormProps) {
  const { t } = useTranslation(['auth', 'validation']);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false);
  const searchParams = useSearchParams();
  const hasOauthProviders = showGoogle || showApple;
  const shouldShowEmailField = showEmailPassword || showMagicLink;

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginFormData>({ defaultValues: { rememberMe: true } });

  const onSubmit = async (formData: LoginFormData) => {
    setIsLoading(true);
    try {
      const next = getSafeNextPath(searchParams.get('next'));

      // POST to server-side login route — sets Supabase cookies server-side
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          next: next ?? undefined,
        }),
      });

      // Defensive content-type check — middleware must never redirect this to an HTML page
      const contentType = res.headers.get('content-type') || '';
      if (process.env.NODE_ENV !== 'production') {
        console.info('[LoginForm] /api/auth/login', res.status, contentType);
      }
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        console.error('[LoginForm] Non-JSON login response:', res.status, text.slice(0, 200));
        throw new Error(t('signIn.invalidResponse', { ns: 'auth' }));
      }

      const json = await res.json();

      if (!res.ok) {
        toast.error(json?.error ?? t('signIn.submitFailed', { ns: 'auth' }));
        setIsLoading(false);
        return;
      }

      const destination: string = json.destination ?? '/dashboard';
      if (process.env.NODE_ENV !== 'production') {
        console.info('[LoginForm] destination', destination);
      }

      if (!destination.startsWith('/')) {
        throw new Error(t('signIn.invalidDestination', { ns: 'auth' }));
      }

      toast.success(t('signIn.success', { ns: 'auth' }));
      trackMarketingEvent('login', { method: 'password' });

      // Hard navigation so the browser sends the new Supabase auth cookies
      // that were set by the server-side route handler.
      window.setTimeout(() => {
        setIsLoading(false);
        toast.error(
          t('signIn.redirectPending', { ns: 'auth', destination })
        );
      }, 2500);
      window.location.replace(destination);
      // Note: do NOT call setIsLoading(false) — page is navigating away
    } catch (err: any) {
      const msg = err?.message || t('signIn.submitFailed', { ns: 'auth' });
      toast.error(msg);
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: buildAuthCallbackUrl('/dashboard'),
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err?.message || t('signIn.oauthFailed', { ns: 'auth', provider: 'Google' }));
      setIsGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setIsAppleLoading(true);
    try {
      const supabase = createClient();
      const callbackUrl = buildAuthCallbackUrl(getSafeNextPath(searchParams.get('next')));
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: callbackUrl,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err?.message || t('signIn.oauthFailed', { ns: 'auth', provider: 'Apple' }));
      setIsAppleLoading(false);
    }
  };

  const handleMagicLinkSignIn = async () => {
    const email = getValues('email')?.trim();
    if (!email) {
      toast.error(t('validation.email', { ns: 'validation' }));
      return;
    }

    setIsMagicLinkLoading(true);
    try {
      const supabase = createClient();
      const callbackUrl = buildAuthCallbackUrl(getSafeNextPath(searchParams.get('next')));

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: callbackUrl,
          shouldCreateUser: false,
        },
      });

      if (error) throw error;
      toast.success(t('forgotPassword.success', { ns: 'auth' }));
    } catch (err: any) {
      toast.error(err?.message || t('signIn.magicLinkFailed', { ns: 'auth' }));
    } finally {
      setIsMagicLinkLoading(false);
    }
  };

  return (
    <div className="fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-700 text-foreground tracking-tight">{t('signIn.title', { ns: 'auth' })}</h1>
        <p className="text-sm text-muted-foreground mt-1.5">{t('signIn.subtitle', { ns: 'auth' })}</p>
      </div>

      {hasOauthProviders ? (
        <div className="space-y-2.5 mb-6">
          {showGoogle ? (
            <button
              type="button"
              className="btn-secondary w-full justify-center py-2.5"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading}
            >
              {isGoogleLoading ? <Loader2 size={16} className="animate-spin" /> : <Globe size={17} />}
              {t('signIn.google', { ns: 'auth' })}
            </button>
          ) : null}
          {showApple ? (
            <button
              type="button"
              className="btn-secondary w-full justify-center py-2.5"
              onClick={handleAppleSignIn}
              disabled={isAppleLoading}
            >
              {isAppleLoading ? <Loader2 size={16} className="animate-spin" /> : <Apple size={17} />}
              {t('signIn.apple', { ns: 'auth' })}
            </button>
          ) : null}
        </div>
      ) : null}

      {hasOauthProviders && shouldShowEmailField ? (
        <div className="flex items-center gap-3 mb-6">
          <hr className="flex-1 border-border" />
          <span className="text-xs text-muted-foreground font-500">
            {showEmailPassword
              ? t('signIn.emailDivider', { ns: 'auth' })
              : t('signIn.emailContinueDivider', { ns: 'auth' })}
          </span>
          <hr className="flex-1 border-border" />
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {shouldShowEmailField ? (
          <div>
            <label htmlFor="login-email" className="block text-sm font-600 text-foreground mb-1.5">
              {t('signIn.email', { ns: 'auth' })}
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              className={`input-base ${errors.email ? 'input-error' : ''}`}
              placeholder={t('signIn.emailPlaceholder', { ns: 'auth' })}
              {...register('email', {
                required: t('validation.required', {
                  ns: 'validation',
                  field: t('signIn.email', { ns: 'auth' }),
                }),
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: t('validation.email', { ns: 'validation' }) },
              })}
            />
            {errors.email && <p className="mt-1.5 text-xs text-negative font-500">{errors.email.message}</p>}
          </div>
        ) : null}

        {showMagicLink ? (
          <button
            type="button"
            onClick={() => void handleMagicLinkSignIn()}
            disabled={isMagicLinkLoading}
            className="btn-secondary w-full justify-center py-2.5"
          >
            {isMagicLinkLoading ? <Loader2 size={16} className="animate-spin" /> : <Globe size={17} />}
            {t('signIn.magicLink', { ns: 'auth' })}
          </button>
        ) : null}

        {showEmailPassword ? (
          <>
            <div>
              <label htmlFor="login-password" className="block text-sm font-600 text-foreground mb-1.5">
                {t('signIn.password', { ns: 'auth' })}
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={`input-base pr-10 ${errors.password ? 'input-error' : ''}`}
                  placeholder={t('signIn.passwordPlaceholder', { ns: 'auth' })}
                  {...register('password', {
                    required: t('validation.required', {
                      ns: 'validation',
                      field: t('signIn.password', { ns: 'auth' }),
                    }),
                    minLength: {
                      value: 8,
                      message: t('validation.minLength', {
                        ns: 'validation',
                        field: t('signIn.password', { ns: 'auth' }),
                        min: 8,
                      }),
                    },
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? t('signIn.hidePassword', { ns: 'auth' }) : t('signIn.showPassword', { ns: 'auth' })}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={onForgotPassword}
                  className="text-xs font-600 text-accent hover:text-teal-600 transition-colors"
                >
                  {t('signIn.forgotPassword', { ns: 'auth' })}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-negative font-500">{errors.password.message}</p>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <input
                id="login-remember"
                type="checkbox"
                className="w-4 h-4 rounded border-border accent-accent cursor-pointer"
                {...register('rememberMe')}
              />
              <label htmlFor="login-remember" className="text-sm text-muted-foreground cursor-pointer select-none">
                {t('signIn.rememberMe', { ns: 'auth' })}
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full justify-center py-2.5 mt-2"
              style={{ minWidth: '160px' }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('signIn.submitting', { ns: 'auth' })}
                </>
              ) : (
                t('signIn.submitCta', { ns: 'auth' })
              )}
            </button>
          </>
        ) : null}
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        {t('signIn.noAccount', { ns: 'auth' })}{' '}
        <button
          onClick={onSwitchToSignUp}
          className="font-600 text-accent hover:text-teal-600 transition-colors"
        >
          {t('signIn.createAccount', { ns: 'auth' })}
        </button>
      </p>
    </div>
  );
}
