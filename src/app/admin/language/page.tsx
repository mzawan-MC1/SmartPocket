'use client';
import React, { useEffect, useState } from 'react';
import { Globe, Check, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { SUPPORTED_LANGUAGES, SUPPORTED_LANGUAGE_CODES, type SupportedLanguage } from '@/i18n/registry';

type LocaleSettingsPayload = {
  defaultLanguage: SupportedLanguage;
  enabledLanguages: SupportedLanguage[];
  persistSource: 'database' | 'fallback';
};

const LANGUAGES = SUPPORTED_LANGUAGES.map((entry) => ({
  code: entry.code as SupportedLanguage,
  name: entry.nativeName,
  flag: entry.flag,
  rtl: entry.rtl,
}));

export default function AdminLanguagePage() {
  const [isLoading, setIsLoading] = useState(true);
  const [persistSource, setPersistSource] = useState<'database' | 'fallback'>('fallback');
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [defaultLang, setDefaultLang] = useState<SupportedLanguage>('en');
  const [enabledLangs, setEnabledLangs] = useState<SupportedLanguage[]>([...SUPPORTED_LANGUAGE_CODES]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/platform/overview', { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'Failed to load platform locale settings.');
        const overview = json as { platform: LocaleSettingsPayload };
        const locale = overview?.platform;
        if (!active || !locale) return;

        const def = SUPPORTED_LANGUAGE_CODES.find((c) => c === locale.defaultLanguage) || 'en';
        const enabledRaw = Array.isArray(locale.enabledLanguages) ? locale.enabledLanguages : [];
        const enabledFiltered = enabledRaw.filter(
          (c): c is SupportedLanguage =>
            SUPPORTED_LANGUAGE_CODES.some((registry) => registry === c)
        );
        if (!enabledFiltered.includes(def)) enabledFiltered.unshift(def);
        const deduped = [...new Set<SupportedLanguage>(enabledFiltered)];

        setDefaultLang(def);
        setEnabledLangs(deduped);
        setPersistSource(locale.persistSource === 'database' ? 'database' : 'fallback');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load locale settings.');
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const toggleLang = (code: SupportedLanguage) => {
    if (code === defaultLang) return;
    if (!SUPPORTED_LANGUAGE_CODES.some((c) => c === code)) return;
    setEnabledLangs((prev) => {
      if (prev.includes(code)) {
        return prev.filter((l) => l !== code);
      }
      return [...prev, code];
    });
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/admin/platform/locale', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          defaultLanguage: defaultLang,
          enabledLanguages: enabledLangs,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to save locale settings.');
      setPersistSource(json?.persistSource === 'database' ? 'database' : 'fallback');
      setSaved(true);
      toast.success('Language settings saved');
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save locale settings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={22} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-700 text-foreground">Language & Localization</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure persisted supported languages and default language for public server rendering,
            SEO metadata, structured data, and public language selectors.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`btn-primary ${saved ? 'bg-positive' : ''}`}
        >
          {isSaving ? (
            <Loader2 size={15} className="animate-spin" />
          ) : saved ? (
            <Check size={15} />
          ) : (
            <Globe size={15} />
          )}
          {saved ? 'Saved' : 'Save Settings'}
        </button>
      </div>

      {persistSource === 'fallback' ? (
        <div className="card-elevated p-4 border-l-4 border-warning flex items-start gap-3">
          <AlertTriangle size={18} className="text-warning mt-0.5 flex-shrink-0" />
          <div className="text-sm space-y-1">
            <p className="font-600 text-foreground">Using built-in fallback defaults</p>
            <p className="text-muted-foreground">
              No persisted platform_settings row was found. Saving below will create the row and
              propagate the enabled-language list to public SEO, structured data, and selectors.
            </p>
          </div>
        </div>
      ) : null}

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
              <div
                key={lang.code}
                className="flex items-center gap-4 p-3 rounded-xl border border-border"
              >
                <span className="text-2xl">{lang.flag}</span>
                <div className="flex-1">
                  <p className="text-sm font-600 text-foreground">{lang.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {lang.code.toUpperCase()}
                    {lang.rtl ? ' · RTL' : ''}
                    {isDefault ? ' · Default' : ''}
                  </p>
                </div>
                <button
                  onClick={() => toggleLang(lang.code)}
                  disabled={isDefault}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    isEnabled ? 'bg-accent' : 'bg-muted'
                  } ${isDefault ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  aria-label={`Toggle ${lang.name}`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${
                      isEnabled ? 'start-5' : 'start-0.5'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card-elevated p-4 border-l-4 border-accent">
        <p className="text-sm font-600 text-foreground mb-1">Arabic RTL Support</p>
        <p className="text-xs text-muted-foreground">
          Arabic is fully supported with automatic RTL layout switching. Translation files are located in{' '}
          <code className="bg-muted px-1 rounded">src/i18n/locales/ar/</code>.
        </p>
      </div>
    </div>
  );
}
