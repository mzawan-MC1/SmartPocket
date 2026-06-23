'use client';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Loader2, Globe, Apple, CheckCircle2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { getSafeNextPath } from '@/lib/auth/redirects';
import { buildAuthCallbackUrl } from '@/lib/auth/urls';

interface SignUpFormData {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreeTerms: boolean;
}

interface SignUpFormProps {
  onSwitchToLogin: () => void;
  showGoogle: boolean;
  showApple: boolean;
  showMagicLink: boolean;
  showEmailPassword: boolean;
}

export default function SignUpForm({
  onSwitchToLogin,
  showGoogle,
  showApple,
  showMagicLink,
  showEmailPassword,
}: SignUpFormProps) {
  const { t } = useTranslation(['auth', 'validation']);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false);
  const [successState, setSuccessState] = useState<'verify-email' | 'ready' | null>(null);
  const { signUp } = useAuth();
  const hasOauthProviders = showGoogle || showApple;
  const shouldShowEmailField = showEmailPassword || showMagicLink;

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    formState: { errors },
  } = useForm<SignUpFormData>();

  const passwordValue = watch('password', '');

  const onSubmit = async (data: SignUpFormData) => {
    setIsLoading(true);
    try {
      const next = getSafeNextPath(searchParams.get('next'));
      const result = await signUp(data.email, data.password, { fullName: data.fullName }, next);

      if (result.requiresEmailVerification) {
        setSuccessState('verify-email');
        toast.success(t('verification.subtitle', { ns: 'auth' }));
      } else {
        setSuccessState('ready');
        toast.success(t('signUp.success', { ns: 'auth' }));
      }
    } catch (err: any) {
      const msg = err?.message || t('signUp.submitFailed', { ns: 'auth' });
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsGoogleLoading(true);
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const callbackUrl = buildAuthCallbackUrl(getSafeNextPath(searchParams.get('next')));
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err?.message || t('signUp.oauthFailed', { ns: 'auth', provider: 'Google' }));
      setIsGoogleLoading(false);
    }
  };

  const handleAppleSignUp = async () => {
    setIsAppleLoading(true);
    try {
      const { createClient } = await import('@/lib/supabase/client');
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
      toast.error(err?.message || t('signUp.oauthFailed', { ns: 'auth', provider: 'Apple' }));
      setIsAppleLoading(false);
    }
  };

  const handleMagicLinkSignUp = async () => {
    const email = getValues('email')?.trim();
    if (!email) {
      toast.error(t('validation.email', { ns: 'validation' }));
      return;
    }

    setIsMagicLinkLoading(true);
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const callbackUrl = buildAuthCallbackUrl(getSafeNextPath(searchParams.get('next')));

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: callbackUrl,
        },
      });

      if (error) throw error;
      toast.success(t('forgotPassword.success', { ns: 'auth' }));
    } catch (err: any) {
      toast.error(err?.message || t('signUp.magicLinkFailed', { ns: 'auth' }));
    } finally {
      setIsMagicLinkLoading(false);
    }
  };

  if (successState) {
    const needsVerification = successState === 'verify-email';

    return (
      <div className="text-center fade-in py-8">
        <div className="w-16 h-16 rounded-full bg-positive-soft flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={32} className="text-positive" />
        </div>
        <h2 className="text-xl font-700 text-foreground mb-2">
          {needsVerification ? t('verification.title', { ns: 'auth' }) : t('signUp.success', { ns: 'auth' })}
        </h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
          {needsVerification
            ? t('verification.subtitle', { ns: 'auth' })
            : t('signUp.subtitle', { ns: 'auth' })}
        </p>
        <button
          onClick={() => {
            if (needsVerification) {
              onSwitchToLogin();
              return;
            }

            router.replace('/');
          }}
          className="btn-primary mx-auto"
        >
          {needsVerification ? t('forgotPassword.backToSignIn', { ns: 'auth' }) : t('signUp.continue', { ns: 'auth' })}
        </button>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-700 text-foreground tracking-tight">{t('signUp.title', { ns: 'auth' })}</h1>
        <p className="text-sm text-muted-foreground mt-1.5">{t('signUp.subtitle', { ns: 'auth' })}</p>
      </div>

      {hasOauthProviders ? (
        <div className="space-y-2.5 mb-6">
          {showGoogle ? (
            <button
              type="button"
              className="btn-secondary w-full justify-center py-2.5"
              onClick={handleGoogleSignUp}
              disabled={isGoogleLoading}
            >
              {isGoogleLoading ? <Loader2 size={16} className="animate-spin" /> : <Globe size={17} />}
              {t('signUp.google', { ns: 'auth' })}
            </button>
          ) : null}
          {showApple ? (
            <button
              type="button"
              className="btn-secondary w-full justify-center py-2.5"
              onClick={handleAppleSignUp}
              disabled={isAppleLoading}
            >
              {isAppleLoading ? <Loader2 size={16} className="animate-spin" /> : <Apple size={17} />}
              {t('signUp.apple', { ns: 'auth' })}
            </button>
          ) : null}
        </div>
      ) : null}

      {hasOauthProviders && shouldShowEmailField ? (
        <div className="flex items-center gap-3 mb-6">
          <hr className="flex-1 border-border" />
          <span className="text-xs text-muted-foreground font-500">
            {showEmailPassword
              ? t('signUp.emailDivider', { ns: 'auth' })
              : t('signUp.emailContinueDivider', { ns: 'auth' })}
          </span>
          <hr className="flex-1 border-border" />
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {showEmailPassword ? (
          <div>
            <label htmlFor="signup-name" className="block text-sm font-600 text-foreground mb-1.5">
              {t('signUp.fullName', { ns: 'auth' })}
            </label>
            <input
              id="signup-name"
              type="text"
              autoComplete="name"
              className={`input-base ${errors.fullName ? 'input-error' : ''}`}
              placeholder={t('signUp.fullNamePlaceholder', { ns: 'auth' })}
              {...register('fullName', {
                required: t('validation.required', {
                  ns: 'validation',
                  field: t('signUp.fullName', { ns: 'auth' }),
                }),
                minLength: {
                  value: 2,
                  message: t('validation.minLength', {
                    ns: 'validation',
                    field: t('signUp.fullName', { ns: 'auth' }),
                    min: 2,
                  }),
                },
              })}
            />
            {errors.fullName && (
              <p className="mt-1.5 text-xs text-negative font-500">{errors.fullName.message}</p>
            )}
          </div>
        ) : null}

        {shouldShowEmailField ? (
          <div>
            <label htmlFor="signup-email" className="block text-sm font-600 text-foreground mb-1.5">
              {t('signUp.email', { ns: 'auth' })}
            </label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              className={`input-base ${errors.email ? 'input-error' : ''}`}
              placeholder={t('signUp.emailPlaceholder', { ns: 'auth' })}
              {...register('email', {
                required: t('validation.required', {
                  ns: 'validation',
                  field: t('signUp.email', { ns: 'auth' }),
                }),
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: t('validation.email', { ns: 'validation' }) },
              })}
            />
            {errors.email && (
              <p className="mt-1.5 text-xs text-negative font-500">{errors.email.message}</p>
            )}
          </div>
        ) : null}

        {showMagicLink ? (
          <button
            type="button"
            onClick={() => void handleMagicLinkSignUp()}
            disabled={isMagicLinkLoading}
            className="btn-secondary w-full justify-center py-2.5"
          >
            {isMagicLinkLoading ? <Loader2 size={16} className="animate-spin" /> : <Globe size={17} />}
            {t('signUp.magicLink', { ns: 'auth' })}
          </button>
        ) : null}

        {showEmailPassword ? (
          <>
            <div>
              <label htmlFor="signup-password" className="block text-sm font-600 text-foreground mb-1.5">
                {t('signUp.password', { ns: 'auth' })}
              </label>
              <p className="text-xs text-muted-foreground mb-1.5">{t('signUp.passwordHint', { ns: 'auth' })}</p>
              <div className="relative">
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`input-base pr-10 ${errors.password ? 'input-error' : ''}`}
                  placeholder={t('signUp.passwordPlaceholder', { ns: 'auth' })}
                  {...register('password', {
                    required: t('validation.required', {
                      ns: 'validation',
                      field: t('signUp.password', { ns: 'auth' }),
                    }),
                    minLength: {
                      value: 8,
                      message: t('validation.minLength', {
                        ns: 'validation',
                        field: t('signUp.password', { ns: 'auth' }),
                        min: 8,
                      }),
                    },
                    pattern: {
                      value: /^(?=.*[0-9!@#$%^&*])/,
                      message: t('validation.passwordStrength', { ns: 'validation' }),
                    },
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? t('signUp.hidePassword', { ns: 'auth' }) : t('signUp.showPassword', { ns: 'auth' })}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-negative font-500">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="signup-confirm" className="block text-sm font-600 text-foreground mb-1.5">
                {t('signUp.confirmPassword', { ns: 'auth' })}
              </label>
              <div className="relative">
                <input
                  id="signup-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`input-base pr-10 ${errors.confirmPassword ? 'input-error' : ''}`}
                  placeholder={t('signUp.confirmPasswordPlaceholder', { ns: 'auth' })}
                  {...register('confirmPassword', {
                    required: t('signUp.confirmPasswordRequired', { ns: 'auth' }),
                    validate: (v) => v === passwordValue || t('validation.passwordMatch', { ns: 'validation' }),
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showConfirm ? t('signUp.hidePassword', { ns: 'auth' }) : t('signUp.showPassword', { ns: 'auth' })}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1.5 text-xs text-negative font-500">{errors.confirmPassword.message}</p>
              )}
            </div>

            <div>
              <div className="flex items-start gap-2.5">
                <input
                  id="signup-terms"
                  type="checkbox"
                  className="w-4 h-4 rounded border-border accent-accent cursor-pointer mt-0.5 flex-shrink-0"
                  {...register('agreeTerms', { required: t('signUp.agreeRequired', { ns: 'auth' }) })}
                />
                <label htmlFor="signup-terms" className="text-sm text-muted-foreground cursor-pointer select-none">
                  {t('signUp.agreeTerms', { ns: 'auth' })}{' '}
                  <a href="/terms" className="text-accent hover:underline font-600">{t('signUp.terms', { ns: 'auth' })}</a>
                  {' '}{t('signUp.and', { ns: 'auth' })}{' '}
                  <a href="/privacy" className="text-accent hover:underline font-600">{t('signUp.privacy', { ns: 'auth' })}</a>
                </label>
              </div>
              {errors.agreeTerms && (
                <p className="mt-1.5 text-xs text-negative font-500">{errors.agreeTerms.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full justify-center py-2.5 mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('signUp.submitting', { ns: 'auth' })}
                </>
              ) : (
                t('signUp.submitCta', { ns: 'auth' })
              )}
            </button>
          </>
        ) : null}
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        {t('signUp.hasAccount', { ns: 'auth' })}{' '}
        <button
          onClick={onSwitchToLogin}
          className="font-600 text-accent hover:text-teal-600 transition-colors"
        >
          {t('signUp.signIn', { ns: 'auth' })}
        </button>
      </p>
    </div>
  );
}
