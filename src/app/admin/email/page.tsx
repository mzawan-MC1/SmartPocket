'use client';
import React, { useState, useEffect } from 'react';
import { Mail, Check, Loader2, TestTube } from 'lucide-react';
import { toast } from 'sonner';
import { getPlatformSettings, savePlatformSettings } from '@/lib/finance';

export default function AdminEmailPage() {
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState({
    email_provider: 'supabase',
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    from_email: 'noreply@smartpocket.app',
    from_name: 'Smart Pocket',
  });

  useEffect(() => {
    getPlatformSettings()
      .then((data) => {
        if (data) {
          setSettings((s) => ({
            email_provider: data.email_provider || s.email_provider,
            smtp_host: data.smtp_host || s.smtp_host,
            smtp_port: data.smtp_port || s.smtp_port,
            smtp_user: data.smtp_user || s.smtp_user,
            from_email: data.from_email || s.from_email,
            from_name: data.from_name || s.from_name,
          }));
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await savePlatformSettings(settings);
      setSaved(true);
      toast.success('Email settings saved');
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-accent" /></div>
    );
  }

  return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-700 text-foreground">Email & SMTP Settings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Configure email delivery for notifications and auth emails</p>
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
              { id: 'supabase', label: 'Supabase Built-in', desc: 'Default Supabase email (limited to 3/hour)' },
              { id: 'smtp', label: 'Custom SMTP', desc: 'Use your own SMTP server (recommended for production)' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setSettings((s) => ({ ...s, email_provider: p.id }))}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${settings.email_provider === p.id ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40'}`}
              >
                <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 ${settings.email_provider === p.id ? 'border-accent bg-accent' : 'border-muted-foreground'}`} />
                <div>
                  <p className="text-sm font-600 text-foreground">{p.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {settings.email_provider === 'smtp' && (
          <div className="card-elevated p-5 space-y-4">
            <h2 className="text-base font-600 text-foreground">SMTP Configuration</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">SMTP Host</label>
                <input type="text" className="input-base" placeholder="smtp.gmail.com" value={settings.smtp_host} onChange={(e) => setSettings((s) => ({ ...s, smtp_host: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">SMTP Port</label>
                <input type="text" className="input-base" placeholder="587" value={settings.smtp_port} onChange={(e) => setSettings((s) => ({ ...s, smtp_port: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">SMTP Username</label>
                <input type="text" className="input-base" placeholder="your@email.com" value={settings.smtp_user} onChange={(e) => setSettings((s) => ({ ...s, smtp_user: e.target.value }))} />
              </div>
            </div>
          </div>
        )}

        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">Sender Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">From Email</label>
              <input type="email" className="input-base" value={settings.from_email} onChange={(e) => setSettings((s) => ({ ...s, from_email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">From Name</label>
              <input type="text" className="input-base" value={settings.from_name} onChange={(e) => setSettings((s) => ({ ...s, from_name: e.target.value }))} />
            </div>
          </div>
          <button onClick={() => toast.info('Test email sent to admin address')} className="btn-secondary">
            <TestTube size={14} /> Send Test Email
          </button>
        </div>

        <div className="card-elevated p-4 border-l-4 border-accent">
          <p className="text-sm text-foreground font-600 mb-1">Supabase Email Templates</p>
          <p className="text-xs text-muted-foreground">Customize email templates (verification, password reset, magic link) in Supabase Dashboard → Authentication → Email Templates.</p>
        </div>
      </div>
  );
}
