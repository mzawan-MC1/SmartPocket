'use client';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Loader2, Globe, Apple } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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

/** Returns a safe internal redirect path, or null if the value is external/unsafe. */
function getSafeRedirect(next: string | null): string | null {
  if (!next) return null;
  if (next.startsWith('/') && !next.startsWith('//')) {
    if (next.startsWith('/sign-up-login') || next.startsWith('/auth/')) return null;
    return next;
  }
  return null;
}

export default function LoginForm({
  onSwitchToSignUp,
  onForgotPassword,
  showGoogle,
  showApple,
  showMagicLink,
  showEmailPassword,
}: LoginFormProps) {
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
      const next = getSafeRedirect(searchParams.get('next'));

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
        throw new Error('The login service returned an invalid response.');
      }

      const json = await res.json();

      if (!res.ok) {
        toast.error(json?.error ?? 'Sign in failed. Please check your credentials.');
        setIsLoading(false);
        return;
      }

      const destination: string = json.destination ?? '/dashboard';
      if (process.env.NODE_ENV !== 'production') {
        console.info('[LoginForm] destination', destination);
      }

      if (!destination.startsWith('/')) {
        throw new Error('The login service returned an invalid destination.');
      }

      toast.success('Welcome back!');

      // Hard navigation so the browser sends the new Supabase auth cookies
      // that were set by the server-side route handler.
      window.setTimeout(() => {
        setIsLoading(false);
        toast.error(`Sign in succeeded, but redirect to ${destination} did not start.`);
      }, 2500);
      window.location.replace(destination);
      // Note: do NOT call setIsLoading(false) — page is navigating away
    } catch (err: any) {
      const msg = err?.message || 'Sign in failed. Please check your credentials.';
      toast.error(msg);
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const supabase = createClient();
      const next = getSafeRedirect(searchParams.get('next'));
      const callbackUrl = new URL('/api/auth/callback', window.location.origin);
      if (next) callbackUrl.searchParams.set('next', next);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl.toString(),
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err?.message || 'Google sign-in failed. Configure Google OAuth in Supabase first.');
      setIsGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setIsAppleLoading(true);
    try {
      const supabase = createClient();
      const next = getSafeRedirect(searchParams.get('next'));
      const callbackUrl = new URL('/api/auth/callback', window.location.origin);
      if (next) callbackUrl.searchParams.set('next', next);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: callbackUrl.toString(),
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err?.message || 'Apple sign-in failed. Configure Apple OAuth in Supabase first.');
      setIsAppleLoading(false);
    }
  };

  const handleMagicLinkSignIn = async () => {
    const email = getValues('email')?.trim();
    if (!email) {
      toast.error('Enter your email address to receive a magic link.');
      return;
    }

    setIsMagicLinkLoading(true);
    try {
      const supabase = createClient();
      const next = getSafeRedirect(searchParams.get('next'));
      const callbackUrl = new URL('/api/auth/callback', window.location.origin);
      if (next) callbackUrl.searchParams.set('next', next);

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: callbackUrl.toString(),
          shouldCreateUser: false,
        },
      });

      if (error) throw error;
      toast.success('Magic link sent. Check your email to continue.');
    } catch (err: any) {
      toast.error(err?.message || 'Magic link sign-in failed. Please try again.');
    } finally {
      setIsMagicLinkLoading(false);
    }
  };

  return (
    <div className="fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-700 text-foreground tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground mt-1.5">Sign in to your Smart Pocket account</p>
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
              Continue with Google
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
              Continue with Apple
            </button>
          ) : null}
        </div>
      ) : null}

      {hasOauthProviders && shouldShowEmailField ? (
        <div className="flex items-center gap-3 mb-6">
          <hr className="flex-1 border-border" />
          <span className="text-xs text-muted-foreground font-500">
            {showEmailPassword ? 'or sign in with email' : 'or continue with email'}
          </span>
          <hr className="flex-1 border-border" />
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {shouldShowEmailField ? (
          <div>
            <label htmlFor="login-email" className="block text-sm font-600 text-foreground mb-1.5">
              Email address
            </label>
            <input
              id="login-email"
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
            onClick={() => void handleMagicLinkSignIn()}
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
              <label htmlFor="login-password" className="block text-sm font-600 text-foreground mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={`input-base pr-10 ${errors.password ? 'input-error' : ''}`}
                  placeholder="••••••••"
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 8, message: 'Password must be at least 8 characters' },
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
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={onForgotPassword}
                  className="text-xs font-600 text-accent hover:text-teal-600 transition-colors"
                >
                  Forgot password?
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
                Keep me signed in for 30 days
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
                  Signing in...
                </>
              ) : (
                'Sign In to Smart Pocket'
              )}
            </button>
          </>
        ) : null}
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        Don&apos;t have an account?{' '}
        <button
          onClick={onSwitchToSignUp}
          className="font-600 text-accent hover:text-teal-600 transition-colors"
        >
          Create one free
        </button>
      </p>
    </div>
  );
}
