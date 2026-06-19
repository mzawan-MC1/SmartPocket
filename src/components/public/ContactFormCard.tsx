'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Loader2, Mail, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export default function ContactFormCard() {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContactFormData>();

  const onSubmit = async (data: ContactFormData) => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoading(false);
    setSent(true);
    toast.success('Message sent! We will get back to you within 24 hours.');
    void data;
  };

  if (sent) {
    return (
      <div className="card-elevated p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-positive-soft flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={32} className="text-positive" />
        </div>
        <h2 className="text-xl font-700 text-foreground mb-2">Message sent!</h2>
        <p className="text-sm text-muted-foreground">We will get back to you within 24 hours.</p>
      </div>
    );
  }

  return (
    <div className="card-elevated p-8">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="contact-name" className="block text-sm font-600 text-foreground mb-1.5">Name</label>
            <input id="contact-name" type="text" className={`input-base ${errors.name ? 'input-error' : ''}`} placeholder="Your name" {...register('name', { required: 'Name is required' })} />
            {errors.name && <p className="mt-1.5 text-xs text-negative font-500">{errors.name.message}</p>}
          </div>
          <div>
            <label htmlFor="contact-email" className="block text-sm font-600 text-foreground mb-1.5">Email</label>
            <input id="contact-email" type="email" className={`input-base ${errors.email ? 'input-error' : ''}`} placeholder="you@example.com" {...register('email', { required: 'Email is required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' } })} />
            {errors.email && <p className="mt-1.5 text-xs text-negative font-500">{errors.email.message}</p>}
          </div>
        </div>
        <div>
          <label htmlFor="contact-subject" className="block text-sm font-600 text-foreground mb-1.5">Subject</label>
          <input id="contact-subject" type="text" className={`input-base ${errors.subject ? 'input-error' : ''}`} placeholder="How can we help?" {...register('subject', { required: 'Subject is required' })} />
          {errors.subject && <p className="mt-1.5 text-xs text-negative font-500">{errors.subject.message}</p>}
        </div>
        <div>
          <label htmlFor="contact-message" className="block text-sm font-600 text-foreground mb-1.5">Message</label>
          <textarea id="contact-message" rows={5} className={`input-base resize-none ${errors.message ? 'input-error' : ''}`} placeholder="Tell us more..." {...register('message', { required: 'Message is required', minLength: { value: 20, message: 'Please provide more detail (at least 20 characters)' } })} />
          {errors.message && <p className="mt-1.5 text-xs text-negative font-500">{errors.message.message}</p>}
        </div>
        <button type="submit" disabled={isLoading} className="btn-primary w-full justify-center py-2.5">
          {isLoading ? <><Loader2 size={16} className="animate-spin" />Sending...</> : <><Mail size={16} />Send Message</>}
        </button>
      </form>
    </div>
  );
}
