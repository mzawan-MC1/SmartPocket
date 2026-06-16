'use client';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

interface ForgotFormData {
  email: string;
}

interface ForgotPasswordFormProps {
  onBack: () => void;
}

export default function ForgotPasswordForm({ onBack }: ForgotPasswordFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ForgotFormData>();

  const onSubmit = async (data: ForgotFormData) => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.success('Password reset link sent!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send reset link. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="fade-in">
        <button onClick={onBack} className="btn-ghost px-0 mb-6 -ml-1 text-muted-foreground">
          <ArrowLeft size={16} />
          Back to Sign In
        </button>
        <div className="text-center py-6">
          <div className="w-14 h-14 rounded-full bg-info-soft flex items-center justify-center mx-auto mb-4">
            <Mail size={26} className="text-info" />
          </div>
          <h2 className="text-xl font-700 text-foreground mb-2">Reset link sent</h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            We sent a password reset link to{' '}
            <span className="font-600 text-foreground">{getValues('email')}</span>. Check your inbox.
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            Didn&apos;t receive it? Check your spam folder or{' '}
            <button onClick={() => setSent(false)} className="text-accent hover:underline font-600">
              try again
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <button onClick={onBack} className="btn-ghost px-0 mb-6 -ml-1 text-muted-foreground">
        <ArrowLeft size={16} />
        Back to Sign In
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-700 text-foreground tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Enter your email and we&apos;ll send a secure reset link.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="forgot-email" className="block text-sm font-600 text-foreground mb-1.5">
            Email address
          </label>
          <input
            id="forgot-email"
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

        <button
          type="submit"
          disabled={isLoading}
          className="btn-primary w-full justify-center py-2.5 mt-2"
        >
          {isLoading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Sending reset link...
            </>
          ) : (
            'Send Reset Link'
          )}
        </button>
      </form>
    </div>
  );
}