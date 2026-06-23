'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Mail, ShieldCheck, TestTube } from 'lucide-react';
import { toast } from 'sonner';
import MediaUploadCard from '@/components/ui/MediaUploadCard';
import { isSupportedUploadFile, uploadPublicMedia } from '@/lib/media-upload';

const IMAGE_UPLOAD = {
  accept: '.png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml',
  acceptedFormatsLabel: 'PNG, JPG, JPEG, WEBP, SVG',
  maxSizeBytes: 2 * 1024 * 1024,
  maxSizeLabel: '2 MB',
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  allowedExtensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'],
};

export default function AdminEmailPage() {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [passwordConfigured, setPasswordConfigured] = useState(false);
  const [clearSmtpPassword, setClearSmtpPassword] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoProgress, setLogoProgress] = useState(0);
  const [settings, setSettings] = useState({
    email_provider: 'supabase',
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_password: '',
    from_email: 'no-reply@1smartpocket.com',
    from_name: 'Smart Pocket',
    reply_to_email: 'info@1smartpocket.com',
    support_email: 'info@1smartpocket.com',
    email_logo_url: '/assets/images/app_logo.png',
    footer_company_name: 'Smart Pocket',
    footer_website_url: 'https://1smartpocket.com',
    footer_copyright: '© Smart Pocket. All rights reserved.',
    test_recipient_email: '',
  });

  useEffect(() => {
    fetch('/api/admin/email/settings', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load email settings.');
        }

        const data = payload?.settings;
        setPasswordConfigured(Boolean(payload?.passwordConfigured));
        if (data) {
          setSettings((current) => ({
            email_provider: data.email_provider || current.email_provider,
            smtp_host: data.smtp_host || current.smtp_host,
            smtp_port: data.smtp_port || current.smtp_port,
            smtp_user: data.smtp_user || current.smtp_user,
            smtp_password: '',
            from_email: data.from_email || current.from_email,
            from_name: data.from_name || current.from_name,
            reply_to_email: data.reply_to_email || current.reply_to_email,
            support_email: data.support_email || data.contact_email || current.support_email,
            email_logo_url: data.email_logo_url || data.logo_url || current.email_logo_url,
            footer_company_name: data.footer_company_name || data.app_name || current.footer_company_name,
            footer_website_url: data.footer_website_url || data.canonical_url || current.footer_website_url,
            footer_copyright: data.footer_copyright || current.footer_copyright,
            test_recipient_email: data.test_recipient_email || current.test_recipient_email,
          }));
        }
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to load email settings.');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleLogoSelection = (file: File | null) => {
    if (!file) {
      setLogoFile(null);
      setLogoError(null);
      setLogoProgress(0);
      return;
    }

    try {
      isSupportedUploadFile({
        file,
        allowedMimeTypes: IMAGE_UPLOAD.allowedMimeTypes,
        allowedExtensions: IMAGE_UPLOAD.allowedExtensions,
        maxSizeBytes: IMAGE_UPLOAD.maxSizeBytes,
      });
      setLogoFile(file);
      setLogoError(null);
    } catch (error) {
      setLogoFile(null);
      setLogoError(error instanceof Error ? error.message : 'Invalid file.');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let emailLogoUrl = settings.email_logo_url;

      if (logoFile) {
        const result = await uploadPublicMedia({
          file: logoFile,
          folder: 'branding',
          filePrefix: 'email-logo',
          maxSizeBytes: IMAGE_UPLOAD.maxSizeBytes,
          allowedMimeTypes: IMAGE_UPLOAD.allowedMimeTypes,
          allowedExtensions: IMAGE_UPLOAD.allowedExtensions,
          onProgress: setLogoProgress,
        });
        emailLogoUrl = result.publicUrl;
      }

      const response = await fetch('/api/admin/email/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          email_logo_url: emailLogoUrl,
          smtp_password: settings.smtp_password,
          clear_smtp_password: clearSmtpPassword,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save email settings.');
      }

      setSettings((current) => ({
        ...current,
        email_logo_url: emailLogoUrl,
        smtp_password: '',
      }));
      setLogoFile(null);
      setLogoProgress(0);
      setClearSmtpPassword(false);
      setPasswordConfigured(clearSmtpPassword ? false : passwordConfigured || Boolean(settings.smtp_password));
      setSaved(true);
      router.refresh();
      toast.success('Email settings saved.');
      setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save email settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTest = async () => {
    setIsSendingTest(true);
    try {
      const response = await fetch('/api/admin/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: settings.test_recipient_email }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to send test email.');
      }

      toast.success(`Test email sent to ${settings.test_recipient_email}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send test email.');
    } finally {
      setIsSendingTest(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-700 text-foreground">Email & SMTP Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure production sender identity, SMTP delivery, branded email assets, and the test-email workflow.
          </p>
        </div>
        <button onClick={handleSave} disabled={isSaving} className={`btn-primary ${saved ? 'bg-positive' : ''}`}>
          {isSaving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Mail size={15} />}
          {saved ? 'Saved' : 'Save Settings'}
        </button>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <h2 className="text-base font-600 text-foreground">Email Provider</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { id: 'supabase', label: 'Supabase Auth', desc: 'Supabase Dashboard controls auth-template delivery. Use this mode if the app does not send SMTP messages directly.' },
            { id: 'smtp', label: 'Custom SMTP', desc: 'Use your branded sender domain for production-ready delivery and test sending from the admin portal.' },
          ].map((provider) => (
            <button
              key={provider.id}
              onClick={() => setSettings((current) => ({ ...current, email_provider: provider.id }))}
              className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                settings.email_provider === provider.id
                  ? 'border-accent bg-accent/5'
                  : 'border-border hover:border-accent/40'
              }`}
            >
              <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 ${settings.email_provider === provider.id ? 'border-accent bg-accent' : 'border-muted-foreground'}`} />
              <div>
                <p className="text-sm font-600 text-foreground">{provider.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{provider.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <h2 className="text-base font-600 text-foreground">Sender Identity</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">From Email</label>
            <input
              type="email"
              className="input-base"
              value={settings.from_email}
              onChange={(event) => setSettings((current) => ({ ...current, from_email: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">From Name</label>
            <input
              type="text"
              className="input-base"
              value={settings.from_name}
              onChange={(event) => setSettings((current) => ({ ...current, from_name: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Reply-To Email</label>
            <input
              type="email"
              className="input-base"
              value={settings.reply_to_email}
              onChange={(event) => setSettings((current) => ({ ...current, reply_to_email: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Support Email</label>
            <input
              type="email"
              className="input-base"
              value={settings.support_email}
              onChange={(event) => setSettings((current) => ({ ...current, support_email: event.target.value }))}
            />
          </div>
        </div>
      </div>

      {settings.email_provider === 'smtp' ? (
        <div className="card-elevated p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-accent" />
            <h2 className="text-base font-600 text-foreground">SMTP Configuration</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">SMTP Host</label>
              <input
                type="text"
                className="input-base"
                placeholder="smtp.hostinger.com"
                value={settings.smtp_host}
                onChange={(event) => setSettings((current) => ({ ...current, smtp_host: event.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">SMTP Port</label>
              <input
                type="text"
                className="input-base"
                placeholder="465"
                value={settings.smtp_port}
                onChange={(event) => setSettings((current) => ({ ...current, smtp_port: event.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">SMTP Username</label>
              <input
                type="text"
                className="input-base"
                placeholder="info@1smartpocket.com"
                value={settings.smtp_user}
                onChange={(event) => setSettings((current) => ({ ...current, smtp_user: event.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">SMTP Password</label>
              <input
                type="password"
                className="input-base"
                placeholder={passwordConfigured ? 'Saved securely. Enter a new value to replace it.' : 'Enter SMTP password'}
                value={settings.smtp_password}
                onChange={(event) => {
                  setClearSmtpPassword(false);
                  setSettings((current) => ({ ...current, smtp_password: event.target.value }));
                }}
              />
              <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={clearSmtpPassword}
                  onChange={(event) => setClearSmtpPassword(event.target.checked)}
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                Clear the saved SMTP password on the next save
              </label>
            </div>
          </div>
          {passwordConfigured && !clearSmtpPassword ? (
            <p className="text-xs text-muted-foreground">
              A password is already stored securely in the server-only email secrets table.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="card-elevated p-5 space-y-4">
        <h2 className="text-base font-600 text-foreground">Email Branding</h2>
        <MediaUploadCard
          label="Email Logo"
          value={settings.email_logo_url}
          onValueChange={(value) => setSettings((current) => ({ ...current, email_logo_url: value }))}
          selectedFile={logoFile}
          onFileSelect={handleLogoSelection}
          accept={IMAGE_UPLOAD.accept}
          acceptedFormatsLabel={IMAGE_UPLOAD.acceptedFormatsLabel}
          maxSizeLabel={IMAGE_UPLOAD.maxSizeLabel}
          isUploading={isSaving && !!logoFile}
          uploadProgress={logoProgress}
          error={logoError}
          previewVariant="wide"
          helperText="Used in branded application emails and the Supabase template documentation."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Footer Company Name</label>
            <input
              type="text"
              className="input-base"
              value={settings.footer_company_name}
              onChange={(event) => setSettings((current) => ({ ...current, footer_company_name: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Footer Website URL</label>
            <input
              type="url"
              className="input-base"
              value={settings.footer_website_url}
              onChange={(event) => setSettings((current) => ({ ...current, footer_website_url: event.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-600 text-foreground mb-1.5">Footer Copyright</label>
            <input
              type="text"
              className="input-base"
              value={settings.footer_copyright}
              onChange={(event) => setSettings((current) => ({ ...current, footer_copyright: event.target.value }))}
            />
          </div>
        </div>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <h2 className="text-base font-600 text-foreground">Test Email</h2>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-4">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Test Recipient</label>
            <input
              type="email"
              className="input-base"
              value={settings.test_recipient_email}
              onChange={(event) => setSettings((current) => ({ ...current, test_recipient_email: event.target.value }))}
              placeholder="team@1smartpocket.com"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleSendTest}
              disabled={isSendingTest}
              className="btn-secondary w-full sm:w-auto"
            >
              {isSendingTest ? <Loader2 size={14} className="animate-spin" /> : <TestTube size={14} />}
              Send Test Email
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          The admin portal sends test messages only in SMTP mode. Supabase Auth template delivery is still configured in the Supabase Dashboard.
        </p>
      </div>

      <div className="card-elevated p-4 border-l-4 border-accent">
        <p className="text-sm text-foreground font-600 mb-1">Supabase Auth Templates</p>
        <p className="text-xs text-muted-foreground">
          Copy the finalized templates from <code>docs/supabase-auth-email-templates.md</code> into Supabase Dashboard → Authentication → Email Templates.
        </p>
      </div>
    </div>
  );
}
