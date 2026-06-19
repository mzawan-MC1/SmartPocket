'use client';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Loader2, Globe, Apple, CheckCircle2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

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
      const result = await signUp(data.email, data.password, { fullName: data.fullName });

      if (result.requiresEmailVerification) {
        setSuccessState('verify-email');
        toast.success('Account created! Check your email to verify.');
      } else {
        setSuccessState('ready');
        toast.success('Account created! You can continue to Smart Pocket now.');
      }
    } catch (err: any) {
      const msg = err?.message || 'Sign up failed. Please try again.';
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
      const callbackUrl = new URL('/api/auth/callback', window.location.origin);
      const next = searchParams.get('next');
      if (next) callbackUrl.searchParams.set('next', next);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl.toString(),
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err?.message || 'Google sign-up failed. Configure Google OAuth in Supabase first.');
      setIsGoogleLoading(false);
    }
  };

  const handleAppleSignUp = async () => {
    setIsAppleLoading(true);
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const callbackUrl = new URL('/api/auth/callback', window.location.origin);
      const next = searchParams.get('next');
      if (next) callbackUrl.searchParams.set('next', next);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: callbackUrl.toString(),
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err?.message || 'Apple sign-up failed. Configure Apple OAuth in Supabase first.');
      setIsAppleLoading(false);
    }
  };

  const handleMagicLinkSignUp = async () => {
    const email = getValues('email')?.trim();
    if (!email) {
      toast.error('Enter your email address to receive a magic link.');
      return;
    }

    setIsMagicLinkLoading(true);
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const callbackUrl = new URL('/api/auth/callback', window.location.origin);
      const next = searchParams.get('next');
      if (next) callbackUrl.searchParams.set('next', next);

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: callbackUrl.toString(),
        },
      });

      if (error) throw error;
      toast.success('Magic link sent. Check your email to continue.');
    } catch (err: any) {
      toast.error(err?.message || 'Magic link sign-up failed. Please try again.');
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
          {needsVerification ? 'Check your inbox' : 'Account created'}
        </h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
          {needsVerification
            ? 'We sent a verification link to your email. Click it to activate your Smart Pocket account.'
            : 'Your account is ready. Continue to Smart Pocket to finish setting up your profile.'}
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
          {needsVerification ? 'Back to Sign In' : 'Continue to Smart Pocket'}
        </button>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-700 text-foreground tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground mt-1.5">Free to use. No credit card needed.</p>
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
              Sign up with Google
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
              Sign up with Apple
            </button>
          ) : null}
        </div>
      ) : null}

      {hasOauthProviders && shouldShowEmailField ? (
        <div className="flex items-center gap-3 mb-6">
          <hr className="flex-1 border-border" />
          <span className="text-xs text-muted-foreground font-500">
            {showEmailPassword ? 'or sign up with email' : 'or continue with email'}
          </span>
          <hr className="flex-1 border-border" />
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {showEmailPassword ? (
          <div>
            <label htmlFor="signup-name" className="block text-sm font-600 text-foreground mb-1.5">
              Full name
            </label>
            <input
              id="signup-name"
              type="text"
              autoComplete="name"
              className={`input-base ${errors.fullName ? 'input-error' : ''}`}
              placeholder="Your full name"
              {...register('fullName', {
                required: 'Your full name is required',
                minLength: { value: 2, message: 'Name must be at least 2 characters' },
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
              Email address
            </label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              className={`input-base ${errors.email ? 'input-error' : ''}`}
              placeholder="you@example.com"
              {...register('email', {
                required: 'Email address is required',
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address' },
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
            Email me a magic link
          </button>
        ) : null}

        {showEmailPassword ? (
          <>
            <div>
              <label htmlFor="signup-password" className="block text-sm font-600 text-foreground mb-1.5">
                Password
              </label>
              <p className="text-xs text-muted-foreground mb-1.5">At least 8 characters with a number or symbol</p>
              <div className="relative">
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`input-base pr-10 ${errors.password ? 'input-error' : ''}`}
                  placeholder="••••••••"
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 8, message: 'At least 8 characters required' },
                    pattern: {
                      value: /^(?=.*[0-9!@#$%^&*])/,
                      message: 'Include at least one number or special character',
                    },
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
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
                Confirm password
              </label>
              <div className="relative">
                <input
                  id="signup-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`input-base pr-10 ${errors.confirmPassword ? 'input-error' : ''}`}
                  placeholder="••••••••"
                  {...register('confirmPassword', {
                    required: 'Please confirm your password',
                    validate: (v) => v === passwordValue || 'Passwords do not match',
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
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
                  {...register('agreeTerms', { required: 'You must agree to the terms to continue' })}
                />
                <label htmlFor="signup-terms" className="text-sm text-muted-foreground cursor-pointer select-none">
                  I agree to Smart Pocket&apos;s{' '}
                  <a href="/terms" className="text-accent hover:underline font-600">Terms of Service</a>
                  {' '}and{' '}
                  <a href="/privacy" className="text-accent hover:underline font-600">Privacy Policy</a>
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
                  Creating account...
                </>
              ) : (
                'Create Free Account'
              )}
            </button>
          </>
        ) : null}
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        Already have an account?{' '}
        <button
          onClick={onSwitchToLogin}
          className="font-600 text-accent hover:text-teal-600 transition-colors"
        >
          Sign in
        </button>
      </p>
    </div>
  );
}
