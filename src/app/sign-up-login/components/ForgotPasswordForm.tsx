'use client';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { createClient } from '@/lib/supabase/client';
import { buildPasswordResetUrl } from '@/lib/auth/urls';

interface ForgotFormData {
  email: string;
}

interface ForgotPasswordFormProps {
  onBack: () => void;
}

export default function ForgotPasswordForm({ onBack }: ForgotPasswordFormProps) {
  const { t } = useTranslation(['auth', 'validation']);
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
        redirectTo: buildPasswordResetUrl(),
      });
      if (error) throw error;
      setSent(true);
      toast.success(t('forgotPassword.success', { ns: 'auth' }));
    } catch (err: any) {
      toast.error(err?.message || t('forgotPassword.submitFailed', { ns: 'auth' }));
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="fade-in">
        <button onClick={onBack} className="btn-ghost px-0 mb-6 -ml-1 text-muted-foreground">
          <ArrowLeft size={16} />
          {t('forgotPassword.backToSignIn', { ns: 'auth' })}
        </button>
        <div className="text-center py-6">
          <div className="w-14 h-14 rounded-full bg-info-soft flex items-center justify-center mx-auto mb-4">
            <Mail size={26} className="text-info" />
          </div>
          <h2 className="text-xl font-700 text-foreground mb-2">{t('forgotPassword.submit', { ns: 'auth' })}</h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            {t('forgotPassword.sentMessage', { ns: 'auth' })}{' '}
            <span className="font-600 text-foreground">{getValues('email')}</span>. {t('forgotPassword.checkInbox', { ns: 'auth' })}
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            {t('forgotPassword.sentHelp', { ns: 'auth' })}{' '}
            <button onClick={() => setSent(false)} className="text-accent hover:underline font-600">
              {t('forgotPassword.tryAgain', { ns: 'auth' })}
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
          {t('forgotPassword.backToSignIn', { ns: 'auth' })}
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-700 text-foreground tracking-tight">{t('forgotPassword.title', { ns: 'auth' })}</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          {t('forgotPassword.subtitle', { ns: 'auth' })}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="forgot-email" className="block text-sm font-600 text-foreground mb-1.5">
            {t('forgotPassword.email', { ns: 'auth' })}
          </label>
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            className={`input-base ${errors.email ? 'input-error' : ''}`}
            placeholder={t('forgotPassword.emailPlaceholder', { ns: 'auth' })}
            {...register('email', {
              required: t('validation.required', {
                ns: 'validation',
                field: t('forgotPassword.email', { ns: 'auth' }),
              }),
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: t('validation.email', { ns: 'validation' }) },
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
              {t('forgotPassword.submitting', { ns: 'auth' })}
            </>
          ) : (
            t('forgotPassword.submit', { ns: 'auth' })
          )}
        </button>
      </form>
    </div>
  );
}
