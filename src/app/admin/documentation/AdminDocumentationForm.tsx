'use client';

import React, { useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Eye,
  ImagePlus,
  Languages,
  Loader2,
  RefreshCw,
  Save,
  ShieldAlert,
  Square,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import RichTextEditor, {
  type RichTextEditorHandle,
} from '@/components/cms/RichTextEditor';
import type {
  DocumentationArticleInput,
  DocumentationArticleRecord,
  DocumentationStatus,
  DocumentationTranslationStatusResponse,
} from '@/lib/documentation';
import {
  DOCUMENTATION_CATEGORIES,
  normalizeDocumentationArticleInput,
  validateDocumentationArticleInput,
} from '@/lib/documentation';
import { slugifyCmsPageSlug } from '@/lib/cms-pages';

type Mode = 'create' | 'edit';
type WorkItem = { type: 'documentation_article'; id: string; language: string };

interface FormState extends DocumentationArticleInput {
  id?: string;
}

const createEmptyForm = (): FormState => ({
  id: undefined,
  title: '',
  slug: '',
  summary: '',
  content_html: '',
  category: DOCUMENTATION_CATEGORIES[0],
  status: 'draft',
  enabled: true,
  display_order: 0,
  featured_in_footer: false,
  featured_in_header: false,
  featured_order: 0,
});

const recordToForm = (record: DocumentationArticleRecord): FormState => ({
  id: record.id,
  title: record.title,
  slug: record.slug,
  summary: record.summary,
  content_html: record.content_html,
  category: record.category,
  status: record.status,
  enabled: record.enabled,
  display_order: record.display_order,
  featured_in_footer: Boolean(record.featured_in_footer),
  featured_in_header: Boolean(record.featured_in_header),
  featured_order: Number(record.featured_order || 0),
});

function statusChipClass(status: string, hashMatch: boolean) {
  const effectivelyCurrent = status === 'current' && hashMatch;
  if (effectivelyCurrent) return 'bg-positive-soft text-positive border border-positive/10';
  if (status === 'failed') return 'bg-negative-soft text-negative border border-negative/10';
  if (status === 'pending') return 'bg-info-soft text-info border border-info/10';
  if (status === 'outdated') return 'bg-warning/10 text-warning border border-warning/20';
  return 'bg-muted text-muted-foreground border border-border';
}

function languageLabel(language: string, tp: (k: string, d: string, o?: Record<string, unknown>) => string) {
  return tp(
    `adminDocumentation.languages.${language}`,
    language === 'en'
      ? 'English'
      : language === 'ar'
      ? 'Arabic'
      : language === 'fr'
      ? 'French'
      : language === 'ru'
      ? 'Russian'
      : language === 'tr'
      ? 'Turkish'
      : language === 'zh-CN'
      ? 'Simplified Chinese'
      : language === 'es'
      ? 'Spanish'
      : language === 'pt-BR'
      ? 'Brazilian Portuguese'
      : language
  );
}

export default function AdminDocumentationForm({
  mode,
  initial,
  initialTranslationStatus,
}: {
  mode: Mode;
  initial?: DocumentationArticleRecord;
  initialTranslationStatus?: DocumentationTranslationStatusResponse | null;
}) {
  const { t } = useTranslation('portal');
  const router = useRouter();
  const [isSaving, setIsSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string | null>>({});
  const [form, setForm] = React.useState<FormState>(() =>
    mode === 'edit' && initial ? recordToForm(initial) : createEmptyForm()
  );
  const [translation, setTranslation] = React.useState<DocumentationTranslationStatusResponse | null>(
    mode === 'edit' ? initialTranslationStatus ?? null : null
  );
  const [isRegenerating, setIsRegenerating] = React.useState(false);
  const [processingQueue, setProcessingQueue] = React.useState<WorkItem[]>([]);
  const [processingProgress, setProcessingProgress] = React.useState({ completed: 0, total: 0, failed: 0 });
  const stopProcessingRef = React.useRef(false);
  const [stopProcessing, setStopProcessing] = React.useState(false);
  const [insertImageOpen, setInsertImageOpen] = React.useState(false);
  const [insertImageFile, setInsertImageFile] = React.useState<File | null>(null);
  const [insertImageCaption, setInsertImageCaption] = React.useState('');
  const [insertImageAlt, setInsertImageAlt] = React.useState('');
  const [insertImageUploading, setInsertImageUploading] = React.useState(false);
  const editorRef = useRef<RichTextEditorHandle>(null);

  const providerDisabledMessage = React.useMemo(() => {
    if (!translation) return null;
    const known = translation.statuses.find(
      (s) =>
        s.status === 'failed' &&
        s.errorMessage &&
        (s.errorMessage.includes('OPENROUTER_ENABLED') ||
          s.errorMessage.includes('OpenRouter provider is disabled') ||
          s.errorMessage.includes('Gemini translation provider is unavailable') ||
          s.errorMessage.includes('Gemini client is not configured') ||
          s.errorMessage.includes('GEMINI_API_KEY') ||
          s.errorMessage.includes('Legacy OpenRouter translation fallback is disabled') ||
          s.errorMessage.includes('Gemini translation model is not available'))
    );
    return known?.errorMessage || null;
  }, [translation]);

  const tp = React.useCallback(
    (key: string, defaultValue: string, options?: Record<string, unknown>) =>
      t(key, { ns: 'portal', defaultValue, ...options }),
    [t]
  );

  const categoryLabels = React.useMemo(() => {
    const labels: Record<string, string> = {};
    for (const code of DOCUMENTATION_CATEGORIES) {
      const key = `adminDocumentation.categories.${code.replace(/-/g, '')}`;
      labels[code] = tp(key, code.charAt(0).toUpperCase() + code.slice(1).replace(/-/g, ' '));
    }
    return labels;
  }, [tp]);

  const slugLockedRef = React.useRef(false);
  const autoSlug = (value: string) => {
    if (slugLockedRef.current) return;
    setForm((current) => ({ ...current, slug: slugifyCmsPageSlug(value) }));
  };

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    if (key === 'slug') slugLockedRef.current = true;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const refreshTranslationStatus = React.useCallback(async () => {
    if (!form.id) return;
    try {
      const res = await fetch(`/api/admin/documentation/${form.id}/translation-status`, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json && json.articleId) {
          setTranslation(json as DocumentationTranslationStatusResponse);
        }
      }
    } catch {
      /* ignore individual status refresh errors */
    }
  }, [form.id]);

  const validate = (): boolean => {
    const normalized = normalizeDocumentationArticleInput(form);
    const result = validateDocumentationArticleInput(normalized);
    const map: Record<string, string | null> = {};
    for (const issue of result.issues) {
      if (!issue.field) continue;
      map[issue.field] = map[issue.field] || issue.message;
    }
    setErrors(map);
    return result.valid;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) {
      toast.error(tp('adminDocumentation.errors.validation', 'Please fix the highlighted fields.'));
      return;
    }
    setIsSaving(true);
    try {
      const payload = normalizeDocumentationArticleInput(form);
      if (mode === 'create') {
        const res = await fetch('/api/admin/documentation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error || tp('adminDocumentation.errors.create', 'Failed to create article.'));
        }
        toast.success(tp('adminDocumentation.toasts.created', 'Article created.'));
        router.push('/admin/documentation');
        return;
      }
      if (mode === 'edit' && form.id) {
        const res = await fetch(`/api/admin/documentation/${form.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error || tp('adminDocumentation.errors.update', 'Failed to save article.'));
        }
        toast.success(tp('adminDocumentation.toasts.updated', 'Article saved.'));
        await refreshTranslationStatus();
        router.refresh();
        return;
      }
      throw new Error(tp('adminDocumentation.errors.unknown', 'Unknown save mode.'));
    } catch (error: any) {
      toast.error(error?.message || tp('adminDocumentation.errors.save', 'Failed to save.'));
    } finally {
      setIsSaving(false);
    }
  };

  const publishAndSave = async () => {
    updateField('status', 'published');
    setTimeout(() => {
      const syntheticEvent = { preventDefault: () => {} } as unknown as React.FormEvent;
      void submit(syntheticEvent);
    }, 0);
  };

  const processWorkQueue = React.useCallback(async (queue: WorkItem[]) => {
    if (queue.length === 0 || !form.id) return;
    stopProcessingRef.current = false;
    setStopProcessing(false);
    setProcessingQueue(queue);
    let remaining = [...queue];
    let completed = 0;
    let failed = 0;
    let consecutiveFailures = 0;
    setProcessingProgress({ completed: 0, total: queue.length, failed: 0 });

    while (!stopProcessingRef.current && remaining.length > 0) {
      const item = remaining[0];
      setTranslation((cur) =>
        cur
          ? {
              ...cur,
              statuses: cur.statuses.map((s) =>
                s.language === item.language ? { ...s, status: 'pending' as const, errorMessage: undefined } : s
              ),
              pendingCount: (cur.pendingCount || 0) + 1,
            }
          : cur
      );

      try {
        const res = await fetch('/api/admin/content/auto-translate/process-next', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item }),
        });
        const json = await res.json();
        const done = json?.completedItem;
        if (done && done.success) {
          consecutiveFailures = 0;
          completed += 1;
          toast.success(
            tp(
              'adminDocumentation.toasts.translationDonePerLang',
              'Documentation {{language}} translation complete.',
              { language: (done.language as string).toUpperCase() }
            )
          );
        } else {
          consecutiveFailures += 1;
          failed += 1;
          toast.warning(
            tp(
              'adminDocumentation.toasts.translationFailedPerLang',
              '{{language}} translation failed: {{message}}',
              {
                language: ((done?.language as string) || item.language || '').toUpperCase(),
                message: (done?.errorMessage as string) || 'Unknown error',
              }
            )
          );
          if (consecutiveFailures >= 3) {
            stopProcessingRef.current = true;
            setStopProcessing(true);
            toast.error(
              tp(
                'adminDocumentation.toasts.translationCircuitBreaker',
                'Three consecutive translation failures — paused processing.'
              )
            );
          }
        }
      } catch (err: any) {
        consecutiveFailures += 1;
        failed += 1;
        toast.error(
          err?.message || tp('adminDocumentation.errors.translationProcessor', 'Translation processing failed.')
        );
        if (consecutiveFailures >= 3) {
          stopProcessingRef.current = true;
          setStopProcessing(true);
          toast.error(
            tp(
              'adminDocumentation.toasts.translationCircuitBreaker',
              'Three consecutive translation failures — paused processing.'
            )
          );
        }
      } finally {
        setProcessingProgress({ completed, total: queue.length, failed });
        remaining = remaining.slice(1);
        setProcessingQueue(remaining);
      }
    }

    setProcessingQueue([]);
    await refreshTranslationStatus();
  }, [form.id, refreshTranslationStatus, tp]);

  const regenerateTranslations = React.useCallback(async () => {
    if (!form.id) return;
    setIsRegenerating(true);
    try {
      const res = await fetch(`/api/admin/documentation/${form.id}/regenerate-translations`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Regenerate failed.');
      const workItems: WorkItem[] = Array.isArray(json?.workItems) ? json.workItems : [];
      if (workItems.length === 0) {
        toast.success(
          tp(
            'adminDocumentation.toasts.regenerateAllCurrent',
            'All enabled translations are already up to date for this source version.'
          )
        );
      } else {
        toast.success(
          tp(
            'adminDocumentation.toasts.regenerateScheduled',
            'Scheduled {{count}} translations for regeneration.',
            { count: String(workItems.length) }
          )
        );
        await processWorkQueue(workItems);
      }
      await refreshTranslationStatus();
    } catch (err: any) {
      toast.error(err?.message || tp('adminDocumentation.errors.regenerate', 'Failed to regenerate translations.'));
    } finally {
      setIsRegenerating(false);
    }
  }, [form.id, processWorkQueue, refreshTranslationStatus, tp]);

  const isPubliclyVisible = form.status === 'published' && form.enabled === true;
  const fieldError = (key: keyof FormState) => errors[key] || null;
  const hasErrors = Object.values(errors).some(Boolean);
  const isProcessing = isRegenerating || processingQueue.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/documentation"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:border-accent hover:text-accent"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-2xl font-700 text-foreground">
              {mode === 'create'
                ? tp('adminDocumentation.createTitle', 'New documentation article')
                : tp('adminDocumentation.editTitle', 'Edit documentation article')}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {mode === 'create'
                ? tp('adminDocumentation.createDescription', 'Create a new multilingual help guide.')
                : tp('adminDocumentation.editDescription', 'Update the help guide content and settings.')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === 'edit' && form.status === 'published' && form.enabled && form.slug ? (
            <Link
              href={`/help/documentation/${form.slug}`}
              target="_blank"
              className="btn-secondary text-xs py-2"
            >
              <Eye size={14} />
              {tp('adminDocumentation.viewPublic', 'View public')}
            </Link>
          ) : null}
          {mode === 'edit' ? (
            <button
              type="button"
              onClick={() => {
                stopProcessingRef.current = true;
                setStopProcessing(true);
              }}
              disabled={!isProcessing || stopProcessing}
              className="btn-secondary text-xs py-2 disabled:opacity-50 hidden"
            >
              <Square size={14} />
            </button>
          ) : null}
          {mode === 'edit' ? (
            <button
              type="button"
              onClick={() => void regenerateTranslations()}
              disabled={isSaving || isProcessing}
              className="btn-secondary text-xs py-2 disabled:opacity-50"
            >
              {isRegenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {isRegenerating
                ? tp('adminDocumentation.actions.regenerating', 'Regenerating…')
                : tp('adminDocumentation.actions.regenerateTranslations', 'Regenerate Translations')}
            </button>
          ) : null}
          {form.status !== 'published' ? (
            <button
              type="button"
              onClick={() => void publishAndSave()}
              disabled={isSaving || isProcessing}
              className="btn-primary text-xs py-2 disabled:opacity-50"
            >
              <Check size={14} />
              {tp('adminDocumentation.saveAndPublish', 'Save & Publish')}
            </button>
          ) : null}
          <button
            type="submit"
            form="admin-documentation-form"
            disabled={isSaving || isProcessing}
            className="btn-secondary text-xs py-2 disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {tp('adminDocumentation.saveDraft', 'Save')}
          </button>
        </div>
      </div>

      {hasErrors ? (
        <div className="rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning">
          {tp('adminDocumentation.validationBanner', 'Please fix the validation errors below before saving.')}
        </div>
      ) : null}

      {mode === 'edit' && translation ? (
        <div className="card-elevated border border-info/20 bg-info/[0.02] p-4 sm:p-5 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Languages size={16} className="text-info" />
                <h2 className="text-sm font-800 uppercase tracking-[0.12em] text-foreground">
                  {tp('adminDocumentation.translations.heading', 'Translations (auto)')}
                </h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {tp(
                  'adminDocumentation.translations.subheading',
                  'English is the canonical source. Click Regenerate Translations to refresh machine translations for the enabled content languages.'
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-positive-soft px-2.5 py-1 text-[11px] font-800 tabular-nums text-positive">
                <Check size={11} />
                {tp(
                  'adminDocumentation.translations.currentSummary',
                  '{{count}} / {{total}} current',
                  { count: String(translation.currentCount || 0), total: String(translation.totalEnabled || 0) }
                )}
              </span>
              {processingQueue.length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2.5 py-1 text-[11px] font-800 tabular-nums text-info">
                  <Loader2 size={11} className="animate-spin" />
                  {tp(
                    'adminDocumentation.translations.progressSummary',
                    '{{completed}}/{{total}} done, {{failed}} failed',
                    {
                      completed: String(processingProgress.completed),
                      total: String(processingProgress.total),
                      failed: String(processingProgress.failed),
                    }
                  )}
                </span>
              ) : null}
              {translation.failedCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-negative-soft px-2.5 py-1 text-[11px] font-700 tabular-nums text-negative">
                  <ShieldAlert size={11} />
                  {tp(
                    'adminDocumentation.translations.failedSummary',
                    '{{count}} failed',
                    { count: String(translation.failedCount) }
                  )}
                </span>
              ) : null}
            </div>
          </div>

          {providerDisabledMessage ? (
            <div className="rounded-2xl border border-warning/40 bg-warning/[0.05] px-4 py-3 text-sm text-warning flex items-start gap-2">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-700 text-foreground text-xs uppercase tracking-[0.12em]">
                  {tp('adminDocumentation.errors.translationProcessor', 'Translation provider configuration required')}
                </p>
                <p className="mt-1 text-[13px] leading-5 text-warning-foreground/90">
                  {providerDisabledMessage}
                </p>
                <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                  {tp(
                    'adminDocumentation.errors.providerHint',
                    'Regenerate Translations and Backfill Translations will keep failing until this environment variable is set correctly on the server and the deployment is restarted.'
                  )}
                </p>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {translation.statuses.map((row) => (
              <div
                key={row.language}
                className={`rounded-xl border px-3 py-2 text-xs ${statusChipClass(row.status, row.sourceHashMatch)}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-800 uppercase tracking-[0.08em]">
                    {languageLabel(row.language, tp)}
                  </span>
                  <span className="text-[10px] font-700 opacity-80">
                    {row.status === 'pending'
                      ? tp('adminDocumentation.translations.statusPending', 'Queued')
                      : row.status === 'failed'
                      ? tp('adminDocumentation.translations.statusFailed', 'Failed')
                      : row.status === 'outdated' || (row.status === 'current' && !row.sourceHashMatch)
                      ? tp('adminDocumentation.translations.statusOutdated', 'Outdated')
                      : row.status === 'missing'
                      ? tp('adminDocumentation.translations.statusMissing', 'Missing')
                      : tp('adminDocumentation.translations.statusCurrent', 'Current')}
                  </span>
                </div>
                {row.errorMessage ? (
                  <p className="mt-1 text-[10px] opacity-80 line-clamp-2">
                    {String(row.errorMessage).slice(0, 120)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <form id="admin-documentation-form" onSubmit={(e) => void submit(e)} className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <div className="card-elevated p-5 space-y-4">
            <div>
              <label className="block text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground mb-2">
                {tp('adminDocumentation.field.title', 'Title')} <span className="text-negative">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => {
                  autoSlug(e.target.value);
                  updateField('title', e.target.value);
                }}
                placeholder={tp('adminDocumentation.field.titlePlaceholder', 'e.g. How to add your first wallet')}
                className="input-base"
              />
              {fieldError('title') ? (
                <p className="mt-1 text-xs text-negative">{fieldError('title')}</p>
              ) : null}
            </div>

            <div>
              <label className="block text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground mb-2">
                {tp('adminDocumentation.field.slug', 'Slug')} <span className="text-negative">*</span>
              </label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => updateField('slug', slugifyCmsPageSlug(e.target.value))}
                placeholder={tp('adminDocumentation.field.slugPlaceholder', 'e.g. adding-your-first-wallet')}
                className="input-base font-mono text-sm"
              />
              {fieldError('slug') ? (
                <p className="mt-1 text-xs text-negative">{fieldError('slug')}</p>
              ) : null}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {tp('adminDocumentation.field.slugHelpSource', 'Canonical English slug. Auto-generated from title but can be edited.')}
              </p>
            </div>

            <div>
              <label className="block text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground mb-2">
                {tp('adminDocumentation.field.summary', 'Short summary')} <span className="text-negative">*</span>
              </label>
              <textarea
                value={form.summary}
                onChange={(e) => updateField('summary', e.target.value)}
                rows={2}
                placeholder={tp('adminDocumentation.field.summaryPlaceholder', 'What this guide teaches in one or two lines.')}
                className="input-base min-h-[64px] resize-y"
              />
              {fieldError('summary') ? (
                <p className="mt-1 text-xs text-negative">{fieldError('summary')}</p>
              ) : null}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className="block text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground">
                  {tp('adminDocumentation.field.content', 'Document content')} <span className="text-negative">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setInsertImageFile(null);
                    setInsertImageCaption('');
                    setInsertImageAlt('');
                    setInsertImageOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-600 text-foreground transition-colors hover:bg-muted"
                >
                  <ImagePlus size={14} />
                  {tp('adminDocumentation.actions.insertScreenshot', 'Insert screenshot')}
                </button>
              </div>
              <RichTextEditor
                ref={editorRef}
                value={form.content_html}
                onChange={(html) => updateField('content_html', html)}
                placeholder={tp(
                  'adminDocumentation.field.contentPlaceholder',
                  'Write clear, simple steps. Use headings, short paragraphs, and numbered or bulleted lists.'
                )}
                editorClassName="min-h-[320px]"
              />
              {fieldError('content_html') ? (
                <p className="mt-1 text-xs text-negative">{fieldError('content_html')}</p>
              ) : null}
            </div>
          </div>
        </div>

        {insertImageOpen ? (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[1px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-doc-insert-image-title"
            onClick={(e) => {
              if (e.target === e.currentTarget && !insertImageUploading) {
                setInsertImageOpen(false);
              }
            }}
          >
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-card-lg">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3
                    id="admin-doc-insert-image-title"
                    className="text-sm font-800 text-foreground"
                  >
                    {tp('adminDocumentation.actions.uploadImage', 'Upload image / screenshot')}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tp(
                      'adminDocumentation.actions.uploadImageHelp',
                      'PNG, JPG, WEBP or GIF. Maximum 5 MB. The image is inserted at the end of the current content.'
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={insertImageUploading}
                  onClick={() => setInsertImageOpen(false)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-700 text-muted-foreground mb-1.5">
                    {tp('adminDocumentation.field.imageFile', 'Image file')} <span className="text-negative">*</span>
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-background px-3 py-2.5 hover:border-accent/40">
                    <span className="truncate text-xs text-muted-foreground">
                      {insertImageFile
                        ? `${insertImageFile.name} • ${Math.round(insertImageFile.size / 1024)} KB`
                        : tp('adminDocumentation.field.imageFilePlaceholder', 'Choose a PNG / JPG / WEBP / GIF file')}
                    </span>
                    <span className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] font-700 text-foreground">
                      {tp('adminDocumentation.actions.browseFile', 'Browse')}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setInsertImageFile(f);
                        if (f && !insertImageAlt) {
                          const base = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
                          setInsertImageAlt(base.slice(0, 200));
                        }
                      }}
                    />
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-700 text-muted-foreground mb-1.5">
                    {tp('adminDocumentation.field.imageAlt', 'Alt text')}
                  </label>
                  <input
                    type="text"
                    value={insertImageAlt}
                    onChange={(e) => setInsertImageAlt(e.target.value)}
                    placeholder={tp(
                      'adminDocumentation.field.imageAltPlaceholder',
                      'Brief description for accessibility / screen readers'
                    )}
                    className="input w-full text-sm"
                    maxLength={240}
                  />
                </div>

                <div>
                  <label className="block text-xs font-700 text-muted-foreground mb-1.5">
                    {tp('adminDocumentation.field.imageCaption', 'Caption')}{' '}
                    <span className="font-400 normal-case tracking-normal text-muted-foreground/70">
                      ({tp('adminDocumentation.field.optional', 'optional')})
                    </span>
                  </label>
                  <input
                    type="text"
                    value={insertImageCaption}
                    onChange={(e) => setInsertImageCaption(e.target.value)}
                    placeholder={tp(
                      'adminDocumentation.field.imageCaptionPlaceholder',
                      'Short caption displayed below the screenshot'
                    )}
                    className="input w-full text-sm"
                    maxLength={240}
                  />
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={insertImageUploading}
                  onClick={() => setInsertImageOpen(false)}
                  className="btn-secondary text-xs px-3 py-2 disabled:opacity-50"
                >
                  {tp('common.actions.cancel', 'Cancel')}
                </button>
                <button
                  type="button"
                  disabled={!insertImageFile || insertImageUploading}
                  onClick={async () => {
                    if (!insertImageFile) return;
                    try {
                      setInsertImageUploading(true);
                      const fd = new FormData();
                      fd.append('file', insertImageFile);
                      if (insertImageCaption.trim()) fd.append('caption', insertImageCaption.trim());
                      if (insertImageAlt.trim()) fd.append('alt', insertImageAlt.trim());

                      const res = await fetch('/api/admin/documentation/upload-image', {
                        method: 'POST',
                        body: fd,
                      });
                      const json = await res.json();
                      if (!res.ok) {
                        throw new Error(json?.error || 'Failed to upload image.');
                      }

                      const url: string = String(json?.url || '');
                      const alt: string = String(
                        json?.alt || insertImageAlt.trim() || insertImageCaption.trim() || insertImageFile.name
                      ).replace(/"/g, '&quot;');
                      const caption: string = String(json?.caption || insertImageCaption.trim() || '');
                      if (!url) throw new Error('Upload succeeded but returned no URL.');

                      const safeUrl = url.replace(/"/g, '%22');
                      const imgTag = `<img src="${safeUrl}" alt="${alt}" loading="lazy" />`;
                      const block = caption
                        ? `<figure style="margin:1.25rem 0; display:flex; flex-direction:column; align-items:center; gap:0.5rem;">${imgTag}<figcaption style="font-size:0.8rem; text-align:center; color:inherit; opacity:0.8;">${caption}</figcaption></figure>`
                        : imgTag;

                      const insertResult = editorRef.current?.insertHtmlAtSelection(block);
                      if (!insertResult || insertResult.inserted === false) {
                        const previous = form.content_html || '';
                        const next = previous
                          ? `${previous}${previous.endsWith('\n') ? '' : '\n'}${block}\n`
                          : `${block}\n`;
                        updateField('content_html', next);
                      }
                      toast.success(
                        tp('adminDocumentation.toast.imageInserted', 'Image inserted into document content.')
                      );
                      setInsertImageOpen(false);
                      setInsertImageFile(null);
                      setInsertImageCaption('');
                      setInsertImageAlt('');
                    } catch (err: any) {
                      const msg = err instanceof Error ? err.message : String(err || 'Image upload failed.');
                      toast.error(msg);
                    } finally {
                      setInsertImageUploading(false);
                    }
                  }}
                  className="btn-primary text-xs px-3 py-2 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {insertImageUploading ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      {tp('adminDocumentation.actions.uploadingImage', 'Uploading…')}
                    </>
                  ) : (
                    <>
                      <ImagePlus size={13} />
                      {tp('adminDocumentation.actions.uploadAndInsert', 'Upload & insert')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <aside className="space-y-5">
          <div className="card-elevated p-5 space-y-4">
            <div>
              <label className="block text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground mb-2">
                {tp('adminDocumentation.field.category', 'Category / Module')}
              </label>
              <select
                value={form.category}
                onChange={(e) => updateField('category', e.target.value)}
                className="input-base"
              >
                {DOCUMENTATION_CATEGORIES.map((code) => (
                  <option key={code} value={code}>
                    {categoryLabels[code] || code}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground mb-2">
                {tp('adminDocumentation.field.language', 'Language')}
              </label>
              <div className="input-base bg-muted/60 flex items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1 rounded-full bg-positive-soft px-2 py-0.5 text-[10px] font-800 uppercase tracking-[0.1em] text-positive">
                  {tp('adminDocumentation.labels.sourceLanguage', 'Source')}
                </span>
                <span className="font-700 text-foreground">
                  {tp('adminDocumentation.languages.en', 'English')}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {tp('adminDocumentation.field.englishCanonical', 'Only the English source is edited here. Translations are generated.')}
              </p>
            </div>

            <div>
              <label className="block text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground mb-2">
                {tp('adminDocumentation.field.displayOrder', 'Display order')}
              </label>
              <input
                type="number"
                min={-9999}
                max={9999}
                value={form.display_order}
                onChange={(e) => updateField('display_order', Number(e.target.value))}
                className="input-base"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {tp('adminDocumentation.field.displayOrderHelp', 'Lower numbers appear first. Default 0.')}
              </p>
            </div>

            <div>
              <label className="block text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground mb-2">
                {tp('adminDocumentation.field.featuredOrder', 'Featured order')}
              </label>
              <input
                type="number"
                min={-9999}
                max={9999}
                value={form.featured_order}
                onChange={(e) => updateField('featured_order', Number(e.target.value))}
                className="input-base"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {tp('adminDocumentation.field.featuredOrderHelp', 'Lower numbers appear first in public header/footer featured slots.')}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 pt-2">
              <div className="rounded-xl border border-info/15 bg-info/5 px-3 py-2 text-[11px] text-info">
                <span className="font-700">Header navigation</span>
                <span className="mx-1 opacity-70">·</span>
                <span>
                  Add documentation links to the public header (including submenu children) from{' '}
                  <Link href="/admin/cms?tab=header" className="underline underline-offset-2">
                    Admin → CMS → Header Menu
                  </Link>
                  . The direct "Featured in header" toggle below is no longer used.
                </span>
              </div>
              <label className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs cursor-pointer opacity-60">
                <span className="font-700 text-muted-foreground">
                  {tp('adminDocumentation.field.featuredInHeader', 'Featured in header')}
                  <span className="ms-1.5 text-[10px] font-500 text-muted-foreground/70 normal-case tracking-normal">
                    (managed in CMS Header Menu)
                  </span>
                </span>
                <input
                  type="checkbox"
                  disabled
                  checked={false}
                  className="h-4 w-4 accent-info"
                />
              </label>
              <label className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs cursor-pointer">
                <span className="font-700 text-muted-foreground">
                  {tp('adminDocumentation.field.featuredInFooter', 'Featured in footer')}
                </span>
                <input
                  type="checkbox"
                  checked={form.featured_in_footer}
                  onChange={(e) => updateField('featured_in_footer', e.target.checked)}
                  className="h-4 w-4 accent-info"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <label className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs cursor-pointer">
                <span className="font-700 text-muted-foreground">
                  {tp('adminDocumentation.field.enabled', 'Enabled')}
                </span>
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => updateField('enabled', e.target.checked)}
                  className="h-4 w-4 accent-info"
                />
              </label>
              <label className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs cursor-pointer">
                <span className="font-700 text-muted-foreground">
                  {tp('adminDocumentation.field.published', 'Published')}
                </span>
                <input
                  type="checkbox"
                  checked={form.status === 'published'}
                  onChange={(e) =>
                    updateField('status', (e.target.checked ? 'published' : 'draft') as DocumentationStatus)
                  }
                  className="h-4 w-4 accent-info"
                />
              </label>
            </div>
          </div>

          {isPubliclyVisible && mode === 'edit' ? (
            <div className="card-elevated p-4 space-y-2 border border-positive/20 bg-positive/[0.03]">
              <p className="text-xs font-800 uppercase tracking-[0.12em] text-positive">
                {tp('adminDocumentation.visibility.visible', 'Publicly visible')}
              </p>
              <p className="text-xs text-muted-foreground">
                {tp('adminDocumentation.visibility.visibleDesc', 'This English source is published and enabled, so translations and the fallback English article appear to users.')}
              </p>
            </div>
          ) : null}
        </aside>
      </form>
    </div>
  );
}
