'use client';
import React, { useState, useEffect } from 'react';
import { Palette, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getPlatformSettings, savePlatformSettings } from '@/lib/finance';

export default function AdminBrandingPage() {
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState({
    app_name: 'Smart Pocket',
    tagline: 'Personal Finance, Simplified',
    primary_color: '#0f3460',
    accent_color: '#00b4d8',
    logo_url: '/assets/images/app_logo.png',
    favicon_url: '/favicon.ico',
    font_family: 'Plus Jakarta Sans',
  });

  useEffect(() => {
    getPlatformSettings()
      .then((data) => {
        if (data) {
          setSettings((s) => ({
            app_name: data.app_name || s.app_name,
            tagline: data.tagline || s.tagline,
            primary_color: data.primary_color || s.primary_color,
            accent_color: data.accent_color || s.accent_color,
            logo_url: data.logo_url || s.logo_url,
            favicon_url: data.favicon_url || s.favicon_url,
            font_family: data.font_family || s.font_family,
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
      toast.success('Branding settings saved');
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setIsSaving(false);
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-700 text-foreground">Branding & Appearance</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Customize the look and feel of Smart Pocket</p>
          </div>
          <button onClick={handleSave} disabled={isSaving} className={`btn-primary ${saved ? 'bg-positive' : ''}`}>
            {isSaving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Palette size={15} />}
            {saved ? 'Saved' : 'Save Settings'}
          </button>
        </div>

        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">App Identity</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">App Name</label>
              <input type="text" className="input-base" value={settings.app_name} onChange={(e) => setSettings((s) => ({ ...s, app_name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Tagline</label>
              <input type="text" className="input-base" value={settings.tagline} onChange={(e) => setSettings((s) => ({ ...s, tagline: e.target.value }))} />
            </div>
          </div>
        </div>

        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">Colors</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Primary Color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={settings.primary_color} onChange={(e) => setSettings((s) => ({ ...s, primary_color: e.target.value }))} className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
                <input type="text" className="input-base flex-1 font-mono text-sm" value={settings.primary_color} onChange={(e) => setSettings((s) => ({ ...s, primary_color: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Accent Color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={settings.accent_color} onChange={(e) => setSettings((s) => ({ ...s, accent_color: e.target.value }))} className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
                <input type="text" className="input-base flex-1 font-mono text-sm" value={settings.accent_color} onChange={(e) => setSettings((s) => ({ ...s, accent_color: e.target.value }))} />
              </div>
            </div>
          </div>
        </div>

        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">Logo & Favicon</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Logo URL</label>
              <input type="text" className="input-base" value={settings.logo_url} onChange={(e) => setSettings((s) => ({ ...s, logo_url: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Favicon URL</label>
              <input type="text" className="input-base" value={settings.favicon_url} onChange={(e) => setSettings((s) => ({ ...s, favicon_url: e.target.value }))} />
            </div>
          </div>
        </div>

        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">Typography</h2>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Font Family</label>
            <select className="input-base" value={settings.font_family} onChange={(e) => setSettings((s) => ({ ...s, font_family: e.target.value }))}>
              <option value="Plus Jakarta Sans">Plus Jakarta Sans (Default)</option>
              <option value="Inter">Inter</option>
              <option value="Poppins">Poppins</option>
              <option value="Roboto">Roboto</option>
            </select>
          </div>
        </div>
      </div>
  );
}
