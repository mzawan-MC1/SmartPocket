'use client';
import React, { useState } from 'react';
import { Globe, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧', rtl: false },
  { code: 'ar', name: 'العربية', flag: '🇦🇪', rtl: true },
  { code: 'fr', name: 'Français', flag: '🇫🇷', rtl: false },
  { code: 'ru', name: 'Русский', flag: '🇷🇺', rtl: false },
];

export default function AdminLanguagePage() {
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [defaultLang, setDefaultLang] = useState('en');
  const [enabledLangs, setEnabledLangs] = useState(['en', 'ar', 'fr', 'ru']);

  const toggleLang = (code: string) => {
    if (code === defaultLang) return;
    setEnabledLangs((prev) => prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((r) => setTimeout(r, 800));
    setIsSaving(false);
    setSaved(true);
    toast.success('Language settings saved');
    setTimeout(() => setSaved(false), 2500);
  };

  return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-700 text-foreground">Language & Localization</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Configure supported languages and regional settings</p>
          </div>
          <button onClick={handleSave} disabled={isSaving} className={`btn-primary ${saved ? 'bg-positive' : ''}`}>
            {isSaving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Globe size={15} />}
            {saved ? 'Saved' : 'Save Settings'}
          </button>
        </div>

        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">Default Language</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setDefaultLang(lang.code)}
                className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                  defaultLang === lang.code ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40'
                }`}
              >
                <span className="text-xl">{lang.flag}</span>
                <div className="text-left">
                  <p className="text-xs font-600 text-foreground">{lang.name}</p>
                  {lang.rtl && <p className="text-[10px] text-muted-foreground">RTL</p>}
                </div>
                {defaultLang === lang.code && <Check size={12} className="text-accent ms-auto" />}
              </button>
            ))}
          </div>
        </div>

        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">Enabled Languages</h2>
          <div className="space-y-2">
            {LANGUAGES.map((lang) => {
              const isEnabled = enabledLangs.includes(lang.code);
              const isDefault = lang.code === defaultLang;
              return (
                <div key={lang.code} className="flex items-center gap-4 p-3 rounded-xl border border-border">
                  <span className="text-2xl">{lang.flag}</span>
                  <div className="flex-1">
                    <p className="text-sm font-600 text-foreground">{lang.name}</p>
                    <p className="text-xs text-muted-foreground">{lang.code.toUpperCase()}{lang.rtl ? ' · RTL' : ''}{isDefault ? ' · Default' : ''}</p>
                  </div>
                  <button
                    onClick={() => toggleLang(lang.code)}
                    disabled={isDefault}
                    className={`relative w-10 h-5 rounded-full transition-colors ${isEnabled ? 'bg-accent' : 'bg-muted'} ${isDefault ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    aria-label={`Toggle ${lang.name}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${isEnabled ? 'start-5' : 'start-0.5'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card-elevated p-4 border-l-4 border-accent">
          <p className="text-sm font-600 text-foreground mb-1">Arabic RTL Support</p>
          <p className="text-xs text-muted-foreground">
            Arabic is fully supported with automatic RTL layout switching. Translation files are located in <code className="bg-muted px-1 rounded">src/i18n/locales/ar/</code>.
          </p>
        </div>
      </div>
  );
}
