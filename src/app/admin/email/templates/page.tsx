'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Loader2, RefreshCw, Save, Search, Send, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import EmailModuleNav from '@/app/admin/email/components/EmailModuleNav';

type TemplateListItem = {
  template_key: string;
  name: string;
  category: string;
  recipient_type: string;
  subject: string;
  enabled: boolean;
  language_code: string;
  updated_at: string | null;
};

type EmailTemplate = {
  template_key: string;
  name: string;
  category: string;
  recipient_type: 'customer' | 'admin' | 'both';
  subject: string;
  preheader: string | null;
  heading: string | null;
  html_body: string;
  text_body: string;
  button_text: string | null;
  button_url_template: string | null;
  enabled: boolean;
  supported_variables: unknown;
};

type TemplatePreview = {
  subject: string;
  html: string;
  text: string;
  variables: Record<string, string>;
};

export default function AdminEmailTemplatesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<EmailTemplate | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [testRecipient, setTestRecipient] = useState('');

  useEffect(() => {
    setIsLoading(true);
    fetch('/api/admin/email/templates', { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'Failed to load templates.');
        const list = (json?.templates || []) as TemplateListItem[];
        setTemplates(list);
        if (!activeKey && list.length > 0) {
          setActiveKey(list[0].template_key);
        }
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load templates.'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!activeKey) return;
    setPreview(null);
    fetch(`/api/admin/email/templates/${encodeURIComponent(activeKey)}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'Failed to load template.');
        setActiveTemplate((json?.template || null) as EmailTemplate | null);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load template.'));
  }, [activeKey]);

  const categories = useMemo(() => {
    const unique = new Set<string>();
    templates.forEach((t) => unique.add(t.category));
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [templates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      if (!q) return true;
      return (
      t.template_key.toLowerCase().includes(q)
      || t.name.toLowerCase().includes(q)
      || t.category.toLowerCase().includes(q)
      || t.subject.toLowerCase().includes(q)
    );
    });
  }, [search, templates, categoryFilter]);

  const save = async () => {
    if (!activeTemplate) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/email/templates/${encodeURIComponent(activeTemplate.template_key)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(activeTemplate),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to save template.');
      toast.success('Template saved');
      setTemplates((current) =>
        current.map((t) =>
          t.template_key === activeTemplate.template_key
            ? { ...t, subject: activeTemplate.subject, enabled: activeTemplate.enabled }
            : t
        )
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save template.');
    } finally {
      setIsSaving(false);
    }
  };

  const loadPreview = async () => {
    if (!activeTemplate) return;
    setIsPreviewLoading(true);
    try {
      const res = await fetch(`/api/admin/email/templates/${encodeURIComponent(activeTemplate.template_key)}?mode=preview`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to load preview.');
      setPreview((json?.preview || null) as TemplatePreview | null);
      toast.success('Preview updated');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load preview.');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const sendTest = async () => {
    if (!activeTemplate) return;
    const recipient = testRecipient.trim();
    if (!recipient) {
      toast.error('Enter a test recipient email.');
      return;
    }

    setIsSendingTest(true);
    try {
      const res = await fetch(`/api/admin/email/templates/${encodeURIComponent(activeTemplate.template_key)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'send_test', recipient }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to send test email.');
      toast.success('Test email sent');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send test email.');
    } finally {
      setIsSendingTest(false);
    }
  };

  const resetToDefault = async () => {
    if (!activeTemplate) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/email/templates/${encodeURIComponent(activeTemplate.template_key)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'reset_default' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to reset template.');
      toast.success('Template reset to default');
      const refreshed = await fetch(`/api/admin/email/templates/${encodeURIComponent(activeTemplate.template_key)}`, { cache: 'no-store' });
      const refreshedJson = await refreshed.json().catch(() => ({}));
      if (refreshed.ok) setActiveTemplate((refreshedJson?.template || null) as EmailTemplate | null);
      setPreview(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reset template.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={22} className="animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-700 text-foreground">Email templates</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Edit subjects, content, and variables for customer and admin messages.</p>
        </div>
        <button onClick={() => void save()} disabled={isSaving || !activeTemplate} className="btn-primary">
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save
        </button>
      </div>

      <EmailModuleNav />

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
        <div className="card-elevated p-4">
          <div className="flex items-center gap-2 mb-3">
            <Search size={16} className="text-muted-foreground" />
            <input
              className="input-base w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
            />
          </div>
          <div className="flex items-center gap-2 mb-3">
            <select
              className="input-base w-full"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2 max-h-[70vh] overflow-auto pr-1">
            {filtered.map((t) => (
              <button
                key={t.template_key}
                type="button"
                className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${
                  activeKey === t.template_key ? 'border-accent bg-accent/5' : 'border-border hover:bg-muted/30'
                }`}
                onClick={() => setActiveKey(t.template_key)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-700 text-foreground truncate">{t.name}</div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${t.enabled ? 'bg-positive-soft text-positive' : 'bg-muted text-muted-foreground'}`}>
                    {t.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{t.template_key}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="card-elevated p-5">
          {!activeTemplate ? (
            <div className="text-sm text-muted-foreground">Select a template to edit.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-muted-foreground">Template key</div>
                  <div className="font-700 text-foreground">{activeTemplate.template_key}</div>
                </div>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={Boolean(activeTemplate.enabled)}
                    onChange={(e) => setActiveTemplate((t) => (t ? { ...t, enabled: e.target.checked } : t))}
                  />
                  Enabled
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={() => void loadPreview()} disabled={isPreviewLoading}>
                  {isPreviewLoading ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                  Preview
                </button>
                <button type="button" className="btn-secondary" onClick={() => void resetToDefault()} disabled={isSaving}>
                  <RotateCcw size={16} />
                  Reset to default
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-600 text-foreground mb-1.5">Name</label>
                  <input
                    className="input-base w-full"
                    value={activeTemplate.name}
                    onChange={(e) => setActiveTemplate((t) => (t ? { ...t, name: e.target.value } : t))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-600 text-foreground mb-1.5">Category</label>
                  <input
                    className="input-base w-full"
                    value={activeTemplate.category}
                    onChange={(e) => setActiveTemplate((t) => (t ? { ...t, category: e.target.value } : t))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-600 text-foreground mb-1.5">Recipient type</label>
                  <select
                    className="input-base w-full"
                    value={activeTemplate.recipient_type}
                    onChange={(e) => setActiveTemplate((t) => (t ? { ...t, recipient_type: e.target.value as any } : t))}
                  >
                    <option value="customer">Customer</option>
                    <option value="admin">Admin</option>
                    <option value="both">Both</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-600 text-foreground mb-1.5">Subject</label>
                  <input
                    className="input-base w-full"
                    value={activeTemplate.subject}
                    onChange={(e) => setActiveTemplate((t) => (t ? { ...t, subject: e.target.value } : t))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-600 text-foreground mb-1.5">Preheader</label>
                  <input
                    className="input-base w-full"
                    value={activeTemplate.preheader || ''}
                    onChange={(e) => setActiveTemplate((t) => (t ? { ...t, preheader: e.target.value } : t))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-600 text-foreground mb-1.5">Heading</label>
                  <input
                    className="input-base w-full"
                    value={activeTemplate.heading || ''}
                    onChange={(e) => setActiveTemplate((t) => (t ? { ...t, heading: e.target.value } : t))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-600 text-foreground mb-1.5">Button text</label>
                  <input
                    className="input-base w-full"
                    value={activeTemplate.button_text || ''}
                    onChange={(e) => setActiveTemplate((t) => (t ? { ...t, button_text: e.target.value } : t))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-600 text-foreground mb-1.5">Button URL template</label>
                  <input
                    className="input-base w-full"
                    value={activeTemplate.button_url_template || ''}
                    onChange={(e) => setActiveTemplate((t) => (t ? { ...t, button_url_template: e.target.value } : t))}
                    placeholder="{{dashboard_url}}"
                  />
                </div>
              </div>

              <div className="card bg-secondary/30 p-4 rounded-xl border border-border">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-700 text-foreground">Send test email</div>
                  <button type="button" className="btn-secondary" onClick={() => void sendTest()} disabled={isSendingTest}>
                    {isSendingTest ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    Send
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3">
                  <input
                    className="input-base w-full"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    placeholder="test@example.com"
                  />
                  <button type="button" className="btn-secondary" onClick={() => void loadPreview()} disabled={isPreviewLoading}>
                    {isPreviewLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    Refresh preview
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">{'HTML body (variables like {{customer_name}})'}</label>
                <textarea
                  className="input-base w-full min-h-[220px] font-mono text-xs"
                  value={activeTemplate.html_body}
                  onChange={(e) => setActiveTemplate((t) => (t ? { ...t, html_body: e.target.value } : t))}
                />
              </div>

              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">Text body</label>
                <textarea
                  className="input-base w-full min-h-[160px] font-mono text-xs"
                  value={activeTemplate.text_body}
                  onChange={(e) => setActiveTemplate((t) => (t ? { ...t, text_body: e.target.value } : t))}
                />
              </div>

              <div className="card bg-secondary/30 p-4 rounded-xl border border-border space-y-2">
                <div className="text-sm font-700 text-foreground">Supported variables</div>
                <pre className="text-xs whitespace-pre-wrap break-words text-muted-foreground">
                  {JSON.stringify(activeTemplate.supported_variables, null, 2)}
                </pre>
              </div>

              {preview ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-700 text-foreground">Preview</div>
                      <div className="text-xs text-muted-foreground">{preview.subject}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" className={`btn-secondary ${previewMode === 'desktop' ? 'bg-accent/10' : ''}`} onClick={() => setPreviewMode('desktop')}>Desktop</button>
                      <button type="button" className={`btn-secondary ${previewMode === 'mobile' ? 'bg-accent/10' : ''}`} onClick={() => setPreviewMode('mobile')}>Mobile</button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-background overflow-hidden">
                    <div className="p-3 overflow-auto">
                      <div className={previewMode === 'mobile' ? 'w-[390px]' : 'w-full'}>
                        <iframe
                          title="Email preview"
                          className="w-full h-[520px] rounded-lg border border-border bg-white"
                          srcDoc={preview.html}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
