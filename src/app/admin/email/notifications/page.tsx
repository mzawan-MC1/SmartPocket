'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import EmailModuleNav from '@/app/admin/email/components/EmailModuleNav';

type NotificationSettings = {
  admin_notification_email: string | null;
  admin_cc: string | null;
  admin_bcc: string | null;
  sender_name: string | null;
  sender_email: string | null;
  reply_to_email: string | null;
  signature_name: string | null;
  signature_title: string | null;
  footer_disclaimer: string | null;
  trial_reminder_days: number[] | null;
  onboarding_reminder_days: number | null;
  renewal_reminder_days: number | null;
  event_enabled: Record<string, boolean> | null;
};

type TemplateListItem = {
  template_key: string;
  name: string;
  category: string;
  recipient_type: string;
  enabled: boolean;
};

const DEFAULT_SETTINGS: NotificationSettings = {
  admin_notification_email: null,
  admin_cc: null,
  admin_bcc: null,
  sender_name: 'Smart Pocket Team',
  sender_email: 'no-reply@1smartpocket.com',
  reply_to_email: 'info@1smartpocket.com',
  signature_name: 'Smart Pocket Team',
  signature_title: 'Customer Success',
  footer_disclaimer: null,
  trial_reminder_days: [7, 3, 1],
  onboarding_reminder_days: 3,
  renewal_reminder_days: 7,
  event_enabled: {},
};

function parseDays(value: string) {
  return value
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.max(0, Math.floor(n)));
}

export default function AdminEmailNotificationsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [eventSearch, setEventSearch] = useState('');

  const trialDaysText = useMemo(() => (settings.trial_reminder_days || []).join(', '), [settings.trial_reminder_days]);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      fetch('/api/admin/email/notification-settings', { cache: 'no-store' }),
      fetch('/api/admin/email/templates', { cache: 'no-store' }),
    ])
      .then(async ([settingsRes, templatesRes]) => {
        const settingsJson = await settingsRes.json().catch(() => ({}));
        if (!settingsRes.ok) {
          throw new Error(settingsJson?.error || 'Failed to load notification settings.');
        }
        const loaded = (settingsJson?.settings || null) as Partial<NotificationSettings> | null;
        setSettings((current) => ({ ...current, ...loaded }));

        const templatesJson = await templatesRes.json().catch(() => ({}));
        if (templatesRes.ok) {
          setTemplates((templatesJson?.templates || []) as TemplateListItem[]);
        }
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load notification settings.'))
      .finally(() => setIsLoading(false));
  }, []);

  const save = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/email/notification-settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to save notification settings.');
      toast.success('Notification settings saved');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save notification settings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={22} className="animate-spin text-accent" /></div>;
  }

  const filteredTemplates = templates
    .filter((t) => t.template_key && t.name)
    .filter((t) => {
      const q = eventSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        t.template_key.toLowerCase().includes(q)
        || t.name.toLowerCase().includes(q)
        || t.category.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-700 text-foreground">Email notifications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configure admin recipients, signatures, and reminders.</p>
        </div>
        <button onClick={() => void save()} disabled={isSaving} className="btn-primary">
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save
        </button>
      </div>

      <EmailModuleNav />

      <div className="card-elevated p-5 space-y-4">
        <h2 className="text-base font-700 text-foreground">Admin recipients</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Admin notification email</label>
            <input
              className="input-base w-full"
              value={settings.admin_notification_email || ''}
              onChange={(e) => setSettings((s) => ({ ...s, admin_notification_email: e.target.value }))}
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Admin CC (comma-separated)</label>
            <input
              className="input-base w-full"
              value={settings.admin_cc || ''}
              onChange={(e) => setSettings((s) => ({ ...s, admin_cc: e.target.value }))}
              placeholder="cc1@example.com, cc2@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Admin BCC (comma-separated)</label>
            <input
              className="input-base w-full"
              value={settings.admin_bcc || ''}
              onChange={(e) => setSettings((s) => ({ ...s, admin_bcc: e.target.value }))}
              placeholder="bcc@example.com"
            />
          </div>
        </div>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <h2 className="text-base font-700 text-foreground">Identity</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Sender name</label>
            <input
              className="input-base w-full"
              value={settings.sender_name || ''}
              onChange={(e) => setSettings((s) => ({ ...s, sender_name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Sender email</label>
            <input
              className="input-base w-full"
              value={settings.sender_email || ''}
              onChange={(e) => setSettings((s) => ({ ...s, sender_email: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Reply-to email</label>
            <input
              className="input-base w-full"
              value={settings.reply_to_email || ''}
              onChange={(e) => setSettings((s) => ({ ...s, reply_to_email: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <h2 className="text-base font-700 text-foreground">Signature and footer</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Signature name</label>
            <input
              className="input-base w-full"
              value={settings.signature_name || ''}
              onChange={(e) => setSettings((s) => ({ ...s, signature_name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Signature title</label>
            <input
              className="input-base w-full"
              value={settings.signature_title || ''}
              onChange={(e) => setSettings((s) => ({ ...s, signature_title: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Footer disclaimer</label>
          <textarea
            className="input-base w-full min-h-[120px]"
            value={settings.footer_disclaimer || ''}
            onChange={(e) => setSettings((s) => ({ ...s, footer_disclaimer: e.target.value }))}
          />
        </div>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <h2 className="text-base font-700 text-foreground">Reminders</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Trial reminder days</label>
            <input
              className="input-base w-full"
              value={trialDaysText}
              onChange={(e) => setSettings((s) => ({ ...s, trial_reminder_days: parseDays(e.target.value) }))}
              placeholder="7, 3, 1"
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Onboarding reminder delay (days)</label>
            <input
              type="number"
              className="input-base w-full"
              value={settings.onboarding_reminder_days ?? 3}
              onChange={(e) => setSettings((s) => ({ ...s, onboarding_reminder_days: Number(e.target.value) }))}
              min={0}
              step={1}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Renewal reminder (days)</label>
            <input
              type="number"
              className="input-base w-full"
              value={settings.renewal_reminder_days ?? 7}
              onChange={(e) => setSettings((s) => ({ ...s, renewal_reminder_days: Number(e.target.value) }))}
              min={0}
              step={1}
            />
          </div>
        </div>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-base font-700 text-foreground">Event enable/disable</h2>
            <p className="text-xs text-muted-foreground mt-1">Overrides can force an event on/off without changing the template itself.</p>
          </div>
          <input
            className="input-base w-full md:w-[340px]"
            value={eventSearch}
            onChange={(e) => setEventSearch(e.target.value)}
            placeholder="Search events…"
          />
        </div>
        <div className="overflow-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-left">
                <th className="px-4 py-3 font-700 text-foreground">Category</th>
                <th className="px-4 py-3 font-700 text-foreground">Event</th>
                <th className="px-4 py-3 font-700 text-foreground">Recipient</th>
                <th className="px-4 py-3 font-700 text-foreground">Template</th>
                <th className="px-4 py-3 font-700 text-foreground">Override</th>
              </tr>
            </thead>
            <tbody>
              {filteredTemplates.map((tpl) => {
                const override = settings.event_enabled?.[tpl.template_key];
                const overrideValue = typeof override === 'boolean' ? (override ? 'enabled' : 'disabled') : 'default';
                const effectiveEnabled = typeof override === 'boolean' ? override : tpl.enabled;
                return (
                  <tr key={tpl.template_key} className="border-t border-border">
                    <td className="px-4 py-3 text-muted-foreground">{tpl.category}</td>
                    <td className="px-4 py-3">
                      <div className="font-600 text-foreground">{tpl.name}</div>
                      <div className="text-xs text-muted-foreground">{tpl.template_key}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{tpl.recipient_type}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        effectiveEnabled ? 'bg-positive-soft text-positive' : 'bg-muted text-muted-foreground'
                      }`}>
                        {effectiveEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="input-base w-48"
                        value={overrideValue}
                        onChange={(e) => {
                          const next = e.target.value;
                          setSettings((current) => {
                            const currentMap = { ...(current.event_enabled || {}) };
                            if (next === 'default') {
                              delete currentMap[tpl.template_key];
                            } else {
                              currentMap[tpl.template_key] = next === 'enabled';
                            }
                            return { ...current, event_enabled: currentMap };
                          });
                        }}
                      >
                        <option value="default">Default</option>
                        <option value="enabled">Force enabled</option>
                        <option value="disabled">Force disabled</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
              {filteredTemplates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No events found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        Use <span className="font-600 text-foreground">/api/internal/email/run</span> with <span className="font-600 text-foreground">EMAIL_JOB_SECRET</span> to run scheduled reminders and retries.
      </div>
    </div>
  );
}

