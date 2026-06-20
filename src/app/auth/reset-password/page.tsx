'use client';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';

interface ResetFormData {
  password: string;
  confirmPassword: string;
}

export default function ResetPasswordPage() {
  const { t } = useTranslation(['public', 'validation']);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const { register, handleSubmit, watch, formState: { errors } } = useForm<ResetFormData>();
  const passwordValue = watch('password', '');

  const onSubmit = async (data: ResetFormData) => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: data.password });
      if (error) throw error;
      setSuccess(true);
      toast.success(t('resetPassword.toastSuccess'));
      setTimeout(() => router.push('/sign-up-login'), 2000);
    } catch (err: any) {
      toast.error(err?.message || t('resetPassword.toastError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <AppLogo size={48} className="mx-auto mb-3" />
          <h1 className="text-2xl font-700 text-foreground">{t('resetPassword.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1.5">{t('resetPassword.subtitle')}</p>
        </div>

        {success ? (
          <div className="card-elevated p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-positive-soft flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-positive" />
            </div>
            <h2 className="text-xl font-700 text-foreground mb-2">{t('resetPassword.successTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('resetPassword.successDescription')}</p>
          </div>
        ) : (
          <div className="card-elevated p-8">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div>
                <label htmlFor="new-password" className="block text-sm font-600 text-foreground mb-1.5">
                  {t('resetPassword.password')}
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    className={`input-base pr-10 ${errors.password ? 'input-error' : ''}`}
                    placeholder={t('resetPassword.password')}
                    {...register('password', {
                      required: t('validation.required', {
                        ns: 'validation',
                        field: t('resetPassword.password'),
                      }),
                      minLength: {
                        value: 8,
                        message: t('validation.minLength', {
                          ns: 'validation',
                          field: t('resetPassword.password'),
                          min: 8,
                        }),
                      },
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={t('resetPassword.togglePassword')}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <p className="mt-1.5 text-xs text-negative font-500">{errors.password.message}</p>}
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-600 text-foreground mb-1.5">
                  {t('resetPassword.confirmPassword')}
                </label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    className={`input-base pr-10 ${errors.confirmPassword ? 'input-error' : ''}`}
                    placeholder={t('resetPassword.confirmPassword')}
                    {...register('confirmPassword', {
                      required: t('resetPassword.errors.confirmRequired'),
                      validate: (v) => v === passwordValue || t('resetPassword.errors.confirmMismatch'),
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={t('resetPassword.togglePassword')}
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.confirmPassword && <p className="mt-1.5 text-xs text-negative font-500">{errors.confirmPassword.message}</p>}
              </div>

              <button type="submit" disabled={isLoading} className="btn-primary w-full justify-center py-2.5 mt-2">
                {isLoading ? <><Loader2 size={16} className="animate-spin" />{t('resetPassword.submitting')}</> : t('resetPassword.submit')}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
