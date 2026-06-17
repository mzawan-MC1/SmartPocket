'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Languages, Loader2, Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import SearchField from '@/components/ui/SearchField';

type SupportedLanguage = 'en' | 'ar' | 'fr' | 'ru';

interface Translation {
  id: string;
  content_type: string;
  content_key: string;
  language: SupportedLanguage;
  value: string;
  is_approved: boolean;
  is_published: boolean;
}

interface TranslationRow {
  content_type: string;
  content_key: string;
  en: string;
  ar: string;
  fr: string;
  ru: string;
  ids: Partial<Record<SupportedLanguage, string>>;
  approved: Partial<Record<SupportedLanguage, boolean>>;
}

const LANGUAGES: { code: SupportedLanguage; label: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'ru', label: 'Русский', dir: 'ltr' },
];

const CONTENT_TYPES = ['general', 'homepage', 'auth', 'navigation', 'dashboard', 'transactions', 'budgets', 'reports', 'settings', 'email'];

export default function AdminTranslationsPage() {
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [rows, setRows] = useState<TranslationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [activeLanguage, setActiveLanguage] = useState<SupportedLanguage>('en');
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());

  const buildRows = useCallback((data: Translation[]) => {
    const map = new Map<string, TranslationRow>();
    for (const t of data) {
      const key = `${t.content_type}::${t.content_key}`;
      if (!map.has(key)) {
        map.set(key, {
          content_type: t.content_type,
          content_key: t.content_key,
          en: '',
          ar: '',
          fr: '',
          ru: '',
          ids: {},
          approved: {},
        });
      }
      const row = map.get(key)!;
      row[t.language] = t.value;
      row.ids[t.language] = t.id;
      row.approved[t.language] = t.is_approved;
    }
    return Array.from(map.values()).sort((a, b) =>
      `${a.content_type}${a.content_key}`.localeCompare(`${b.content_type}${b.content_key}`)
    );
  }, []);

  const fetchTranslations = useCallback(async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('cms_translations')
        .select('*')
        .order('content_type')
        .order('content_key');
      if (error) throw error;
      setTranslations(data ?? []);
      setRows(buildRows(data ?? []));
    } catch (e) {
      toast.error('Failed to load translations');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [buildRows]);

  useEffect(() => {
    fetchTranslations();
  }, [fetchTranslations]);

  const handleSeedFromSource = async () => {
    setIsSeeding(true);
    try {
      const res = await fetch('/api/admin/translations/seed', { method: 'POST' });
      const contentType = res.headers.get('content-type') || '';
      const json = contentType.includes('application/json') ? await res.json() : null;
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to import translations');
      }
      toast.success(`Imported ${json?.rows ?? 0} rows from source`);
      await fetchTranslations();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to import translations');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleValueChange = (rowKey: string, lang: SupportedLanguage, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (`${r.content_type}::${r.content_key}` === rowKey) {
          return { ...r, [lang]: value };
        }
        return r;
      })
    );
    setDirtyKeys((prev) => new Set(prev).add(`${rowKey}::${lang}`));
  };

  const handleSaveAll = async () => {
    if (dirtyKeys.size === 0) {
      toast.info('No changes to save');
      return;
    }
    setIsSaving(true);
    try {
      const supabase = createClient();
      const upserts: Omit<Translation, 'id'>[] = [];

      for (const dirtyKey of dirtyKeys) {
        const parts = dirtyKey.split('::');
        const lang = parts[parts.length - 1] as SupportedLanguage;
        const contentType = parts[0];
        const contentKey = parts[1];
        const row = rows.find((r) => r.content_type === contentType && r.content_key === contentKey);
        if (!row) continue;
        upserts.push({
          content_type: contentType,
          content_key: contentKey,
          language: lang,
          value: row[lang],
          is_approved: row.approved[lang] ?? false,
          is_published: true,
        });
      }

      const { error } = await supabase
        .from('cms_translations')
        .upsert(upserts, { onConflict: 'content_type,content_key,language' });

      if (error) throw error;
      setDirtyKeys(new Set());
      toast.success(`Saved ${upserts.length} translation(s)`);
      await fetchTranslations();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddKey = async () => {
    const contentType = prompt('Content type (e.g. homepage):');
    if (!contentType) return;
    const contentKey = prompt('Content key (e.g. hero_title):');
    if (!contentKey) return;

    const supabase = createClient();
    const inserts = LANGUAGES.map((l) => ({
      content_type: contentType.trim(),
      content_key: contentKey.trim(),
      language: l.code,
      value: '',
      is_approved: false,
      is_published: false,
    }));

    const { error } = await supabase
      .from('cms_translations')
      .upsert(inserts, { onConflict: 'content_type,content_key,language' });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Translation key added');
      await fetchTranslations();
    }
  };

  const filteredRows = rows.filter((r) => {
    const matchesType = filterType === 'all' || r.content_type === filterType;
    const matchesSearch =
      !search ||
      r.content_key.toLowerCase().includes(search.toLowerCase()) ||
      r.en.toLowerCase().includes(search.toLowerCase()) ||
      r.content_type.toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch;
  });

  const activeLang = LANGUAGES.find((l) => l.code === activeLanguage)!;

  return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-700 text-foreground">CMS Translations</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage content in English, Arabic, French, and Russian</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchTranslations} className="btn-secondary text-sm" title="Refresh">
              <RefreshCw size={14} />
            </button>
            <button onClick={handleSeedFromSource} disabled={isSeeding} className="btn-secondary text-sm">
              {isSeeding ? <Loader2 size={14} className="animate-spin" /> : '+ Import from source'}
            </button>
            <button onClick={handleAddKey} className="btn-secondary text-sm">
              + Add Key
            </button>
            <button onClick={handleSaveAll} disabled={isSaving || dirtyKeys.size === 0} className={`btn-primary ${dirtyKeys.size === 0 ? 'opacity-50' : ''}`}>
              {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Save {dirtyKeys.size > 0 ? `(${dirtyKeys.size})` : 'Changes'}
            </button>
          </div>
        </div>

        {/* Language Tabs */}
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setActiveLanguage(lang.code)}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-600 transition-all ${
                activeLanguage === lang.code ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <SearchField
            type="text"
            wrapperClassName="flex-1 min-w-[200px]"
            inputClassName="text-sm"
            placeholder="Search keys or values..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input-base text-sm w-auto"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Types</option>
            {CONTENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{filteredRows.length} keys</span>
          <span>·</span>
          <span>{dirtyKeys.size} unsaved changes</span>
          <span>·</span>
          <span>Editing: <strong className="text-foreground">{activeLang.label}</strong></span>
        </div>

        {/* Translation Table */}
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={24} className="animate-spin text-accent" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="card-elevated p-12 text-center">
            <Languages size={32} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-600 text-foreground mb-1">No translations found</p>
            <p className="text-xs text-muted-foreground mb-4">
              {rows.length === 0
                ? 'Click "+ Add Key" to create your first translation entry.' :'Try adjusting your search or filter.'}
            </p>
            {rows.length === 0 ? (
              <div className="flex items-center justify-center gap-2">
                <button onClick={handleSeedFromSource} disabled={isSeeding} className="btn-primary text-sm">
                  {isSeeding ? <Loader2 size={15} className="animate-spin" /> : '+ Import from source'}
                </button>
                <button onClick={handleAddKey} className="btn-secondary text-sm">
                  + Add First Key
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRows.map((row) => {
              const rowKey = `${row.content_type}::${row.content_key}`;
              const isDirty = LANGUAGES.some((l) => dirtyKeys.has(`${rowKey}::${l.code}`));
              return (
                <div key={rowKey} className={`card-elevated p-4 space-y-3 ${isDirty ? 'border border-accent/40' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-700 uppercase tracking-wider text-accent bg-accent/10 px-2 py-0.5 rounded-full flex-shrink-0">
                        {row.content_type}
                      </span>
                      <span className="text-sm font-600 text-foreground font-mono truncate">{row.content_key}</span>
                    </div>
                    {isDirty && (
                      <span className="text-[10px] font-600 text-warning bg-warning-soft px-2 py-0.5 rounded-full flex-shrink-0">
                        unsaved
                      </span>
                    )}
                  </div>

                  {/* English reference (always visible) */}
                  {activeLanguage !== 'en' && (
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                      <span className="font-600 text-foreground">EN: </span>{row.en || <em>empty</em>}
                    </div>
                  )}

                  {/* Active language editor */}
                  <div>
                    <label className="block text-xs font-600 text-muted-foreground mb-1">
                      {activeLang.label} translation
                    </label>
                    <textarea
                      rows={2}
                      dir={activeLang.dir}
                      className="input-base resize-none text-sm w-full"
                      placeholder={`Enter ${activeLang.label} translation...`}
                      value={row[activeLanguage]}
                      onChange={(e) => handleValueChange(rowKey, activeLanguage, e.target.value)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
  );
}
