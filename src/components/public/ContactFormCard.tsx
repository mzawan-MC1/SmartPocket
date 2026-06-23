'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Loader2, Mail, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { trackMarketingEvent } from '@/lib/analytics';

interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
  website: string;
}

export default function ContactFormCard() {
  const { t } = useTranslation('public');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormData>();

  const onSubmit = async (data: ContactFormData) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error ||
            t('contactForm.errorToast', {
              defaultValue: 'Failed to send your message. Please try again.',
            })
        );
      }

      trackMarketingEvent('contact_submitted');
      reset();
      setSent(true);
      toast.success(t('contactForm.successToast'));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('contactForm.errorToast', {
              defaultValue: 'Failed to send your message. Please try again.',
            })
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="card-elevated p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-positive-soft flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={32} className="text-positive" />
        </div>
        <h2 className="text-xl font-700 text-foreground mb-2">{t('contactForm.sentTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('contactForm.sentDescription')}</p>
      </div>
    );
  }

  return (
    <div className="card-elevated p-8">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          aria-hidden="true"
          {...register('website')}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="contact-name" className="block text-sm font-600 text-foreground mb-1.5">{t('contactForm.name')}</label>
            <input id="contact-name" type="text" className={`input-base ${errors.name ? 'input-error' : ''}`} placeholder={t('contactForm.namePlaceholder')} {...register('name', { required: t('contactForm.errors.nameRequired') })} />
            {errors.name && <p className="mt-1.5 text-xs text-negative font-500">{errors.name.message}</p>}
          </div>
          <div>
            <label htmlFor="contact-email" className="block text-sm font-600 text-foreground mb-1.5">{t('contactForm.email')}</label>
            <input id="contact-email" type="email" className={`input-base ${errors.email ? 'input-error' : ''}`} placeholder={t('contactForm.emailPlaceholder')} {...register('email', { required: t('contactForm.errors.emailRequired'), pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: t('contactForm.errors.emailInvalid') } })} />
            {errors.email && <p className="mt-1.5 text-xs text-negative font-500">{errors.email.message}</p>}
          </div>
        </div>
        <div>
          <label htmlFor="contact-subject" className="block text-sm font-600 text-foreground mb-1.5">{t('contactForm.subject')}</label>
          <input id="contact-subject" type="text" className={`input-base ${errors.subject ? 'input-error' : ''}`} placeholder={t('contactForm.subjectPlaceholder')} {...register('subject', { required: t('contactForm.errors.subjectRequired') })} />
          {errors.subject && <p className="mt-1.5 text-xs text-negative font-500">{errors.subject.message}</p>}
        </div>
        <div>
          <label htmlFor="contact-message" className="block text-sm font-600 text-foreground mb-1.5">{t('contactForm.message')}</label>
          <textarea id="contact-message" rows={5} className={`input-base resize-none ${errors.message ? 'input-error' : ''}`} placeholder={t('contactForm.messagePlaceholder')} {...register('message', { required: t('contactForm.errors.messageRequired'), minLength: { value: 20, message: t('contactForm.errors.messageMinLength') } })} />
          {errors.message && <p className="mt-1.5 text-xs text-negative font-500">{errors.message.message}</p>}
        </div>
        <button type="submit" disabled={isLoading} className="btn-primary w-full justify-center py-2.5">
          {isLoading ? <><Loader2 size={16} className="animate-spin" />{t('contactForm.submitting')}</> : <><Mail size={16} />{t('contactForm.submit')}</>}
        </button>
      </form>
    </div>
  );
}
