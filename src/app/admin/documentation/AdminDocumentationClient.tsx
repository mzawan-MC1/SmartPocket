'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  DatabaseBackup,
  Eye,
  FilePlus2,
  Languages,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  ShieldAlert,
  Square,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import SearchField from '@/components/ui/SearchField';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import type { DocumentationArticleRecord } from '@/lib/documentation';
import type { DocumentationTranslationStatusResponse } from '@/lib/documentation-translate-server';
import { CONTENT_TRANSLATION_ENABLED_LANGS } from '@/lib/content-translate-server';

type StatusFilter = 'all' | 'draft' | 'published';
type EnabledFilter = 'all' | 'enabled' | 'disabled';

type WorkItem = { type: 'documentation_article'; id: string; language: string };

function translationCoverage(status: DocumentationTranslationStatusResponse | undefined) {
  if (!status) return { current: 0, total: CONTENT_TRANSLATION_ENABLED_LANGS.length, tone: 'neutral' as const };
  const total = status.totalEnabled || CONTENT_TRANSLATION_ENABLED_LANGS.length;
  const current = status.currentCount || 0;
  const ratio = total === 0 ? 0 : current / total;
  let tone: 'positive' | 'warning' | 'danger' | 'neutral' = 'neutral';
  if (ratio === 1) tone = 'positive';
  else if (ratio >= 0.5) tone = 'warning';
  else if (total > 0) tone = 'danger';
  return { current, total, tone };
}

export default function AdminDocumentationClient({
  initialArticles,
  initialTranslationStatuses,
}: {
  initialArticles: DocumentationArticleRecord[];
  initialTranslationStatuses?: Record<string, DocumentationTranslationStatusResponse>;
}) {
  const { t } = useTranslation('portal');
  const router = useRouter();
  const [articles, setArticles] = React.useState(initialArticles);
  const [translationStatuses, setTranslationStatuses] = React.useState<Record<string, DocumentationTranslationStatusResponse>>(
    initialTranslationStatuses ?? {}
  );
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [enabledFilter, setEnabledFilter] = React.useState<EnabledFilter>('all');
  const [deleteState, setDeleteState] = React.useState<{
    id: string;
    title: string;
  } | null>(null);

  const [isBackfilling, setIsBackfilling] = React.useState(false);
  const [backfillActiveId, setBackfillActiveId] = React.useState<string | null>(null);
  const [backfillStats, setBackfillStats] = React.useState({ completed: 0, total: 0, failed: 0 });
  const stopBackfillRef = React.useRef(false);
  const [stopBackfill, setStopBackfill] = React.useState(false);

  const tp = React.useCallback(
    (key: string, defaultValue: string, options?: Record<string, unknown>) =>
      t(key, { ns: 'portal', defaultValue, ...options }),
    [t]
  );

  const refreshTranslationStatusFor = React.useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/documentation/${id}/translation-status`, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json && json.articleId) {
          setTranslationStatuses((prev) => ({ ...prev, [id]: json as DocumentationTranslationStatusResponse }));
        }
      }
    } catch {
      /* swallow individual status refresh failures */
    }
  }, []);

  const reload = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/admin/documentation', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || tp('adminDocumentation.errors.load', 'Failed to load documentation.'));
      }
      const loaded = (json?.articles || []) as DocumentationArticleRecord[];
      setArticles(loaded);
      for (const a of loaded) void refreshTranslationStatusFor(a.id);
    } catch (error: any) {
      toast.error(error?.message || tp('adminDocumentation.errors.refresh', 'Failed to refresh.'));
    } finally {
      setIsRefreshing(false);
    }
  }, [tp, refreshTranslationStatusFor]);

  const processWorkItems = React.useCallback(async (initialItems: WorkItem[]) => {
    if (initialItems.length === 0) return;
    stopBackfillRef.current = false;
    setStopBackfill(false);
    let remaining = [...initialItems];
    let completed = 0;
    let failed = 0;
    let consecutiveFailures = 0;
    setBackfillStats({ completed: 0, total: initialItems.length, failed: 0 });

    while (!stopBackfillRef.current && remaining.length > 0) {
      const item = remaining[0];
      setBackfillActiveId(item.id);
      const row = translationStatuses[item.id];
      if (row) {
        const next = row.statuses.map((s) =>
          s.language === item.language ? { ...s, status: 'pending' as const, errorMessage: undefined } : s
        );
        setTranslationStatuses((prev) => ({
          ...prev,
          [item.id]: { ...row, statuses: next, pendingCount: (row.pendingCount || 0) + 1 },
        }));
      }

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
          await refreshTranslationStatusFor(item.id);
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
          await refreshTranslationStatusFor(item.id);
          if (consecutiveFailures >= 3) {
            stopBackfillRef.current = true;
            setStopBackfill(true);
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
          stopBackfillRef.current = true;
          setStopBackfill(true);
          toast.error(
            tp(
              'adminDocumentation.toasts.translationCircuitBreaker',
              'Three consecutive translation failures — paused processing.'
            )
          );
        }
      } finally {
        setBackfillStats({ completed, total: initialItems.length, failed });
        remaining = remaining.slice(1);
      }
    }

    setBackfillActiveId(null);
  }, [tp, translationStatuses, refreshTranslationStatusFor]);

  const startBackfill = React.useCallback(async () => {
    setIsBackfilling(true);
    stopBackfillRef.current = false;
    setStopBackfill(false);
    let cursor: Record<string, string> = {};
    let totalScheduled = 0;
    let completedScan = 0;

    try {
      toast.info(tp('adminDocumentation.toasts.backfillStarting', 'Starting documentation translation backfill…'));
      while (!stopBackfillRef.current) {
        const res = await fetch('/api/admin/content/auto-translate/backfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope: 'documentation', cursor, batchSize: 5 }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Backfill failed.');

        completedScan += Number(json?.completedScanCount || 0);
        cursor = json?.nextCursor ?? {};
        const scheduledWorkItems: WorkItem[] = Array.isArray(json?.scheduledWorkItems)
          ? json.scheduledWorkItems.filter(
              (it: any) => it && it.type === 'documentation_article'
            )
          : [];
        totalScheduled += scheduledWorkItems.length;
        if (scheduledWorkItems.length > 0) {
          await processWorkItems(scheduledWorkItems);
        }
        const more = Boolean(
          json?.nextCursor &&
            (json.nextCursor.documentationCursor)
        );
        if (!more || stopBackfillRef.current) break;
      }

      if (stopBackfillRef.current) {
        toast.info(tp('adminDocumentation.toasts.backfillStopped', 'Documentation backfill stopped.'));
      } else {
        toast.success(
          tp(
            'adminDocumentation.toasts.backfillDone',
            'Documentation backfill complete. Scheduled {{count}} translations.',
            { count: String(totalScheduled) }
          )
        );
      }
    } catch (err: any) {
      toast.error(err?.message || tp('adminDocumentation.errors.backfill', 'Backfill failed.'));
    } finally {
      setIsBackfilling(false);
      setStopBackfill(false);
      stopBackfillRef.current = false;
      setBackfillStats({ completed: 0, total: 0, failed: 0 });
      await reload();
    }
  }, [tp, processWorkItems, reload]);

  const filteredArticles = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return articles.filter((article) => {
      const matchesSearch =
        !query ||
        article.title.toLowerCase().includes(query) ||
        article.slug.toLowerCase().includes(query) ||
        article.summary.toLowerCase().includes(query) ||
        article.category.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === 'all' || article.status === statusFilter;
      const matchesEnabled =
        enabledFilter === 'all' ||
        (enabledFilter === 'enabled' ? article.enabled : !article.enabled);

      return matchesSearch && matchesStatus && matchesEnabled;
    });
  }, [articles, search, statusFilter, enabledFilter]);

  const toggleStatus = async (article: DocumentationArticleRecord) => {
    setIsSaving(true);
    try {
      const nextStatus = article.status === 'published' ? 'draft' : 'published';
      const res = await fetch(`/api/admin/documentation/${article.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || tp('adminDocumentation.errors.toggleStatus', 'Failed to update publication status.'));
      }
      toast.success(
        nextStatus === 'published'
          ? tp('adminDocumentation.toasts.published', 'Article published.')
          : tp('adminDocumentation.toasts.unpublished', 'Article moved to draft.')
      );
      await reload();
    } catch (error: any) {
      toast.error(error?.message || tp('adminDocumentation.errors.toggleStatus', 'Failed to update publication status.'));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleEnabled = async (article: DocumentationArticleRecord) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/documentation/${article.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !article.enabled }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || tp('adminDocumentation.errors.toggleEnabled', 'Failed to update enabled status.'));
      }
      toast.success(
        article.enabled
          ? tp('adminDocumentation.toasts.disabled', 'Article disabled.')
          : tp('adminDocumentation.toasts.enabled', 'Article enabled.')
      );
      await reload();
    } catch (error: any) {
      toast.error(error?.message || tp('adminDocumentation.errors.toggleEnabled', 'Failed to update enabled status.'));
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (article: DocumentationArticleRecord) => {
    setDeleteState({ id: article.id, title: article.title });
  };

  const handleDelete = async () => {
    if (!deleteState) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/documentation/${deleteState.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || tp('adminDocumentation.errors.delete', 'Failed to delete article.'));
      }
      toast.success(tp('adminDocumentation.toasts.deleted', 'Article deleted.'));
      setDeleteState(null);
      await reload();
    } catch (error: any) {
      toast.error(error?.message || tp('adminDocumentation.errors.delete', 'Failed to delete article.'));
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const displayCategoryLabel = (category: string) => {
    const key = `adminDocumentation.categories.${category.replace(/-/g, '')}`;
    const val = tp(key, '');
    return val || category || '—';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-700 text-foreground">
            {tp('adminDocumentation.title', 'Documentation')}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tp('adminDocumentation.description', 'Manage multilingual help guides. Users see only published and enabled articles.')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void (stopBackfillRef.current = true, setStopBackfill(true))}
            disabled={!isBackfilling}
            className="btn-secondary text-xs py-2 disabled:opacity-50 hidden"
          >
            <Square size={14} />
            {tp('adminDocumentation.actions.stopBackfill', 'Stop')}
          </button>
          <button
            type="button"
            onClick={() => void startBackfill()}
            disabled={isBackfilling || isRefreshing}
            className="btn-secondary text-xs py-2 disabled:opacity-50"
          >
            {isBackfilling ? <Loader2 size={14} className="animate-spin" /> : <DatabaseBackup size={14} />}
            {isBackfilling
              ? tp('adminDocumentation.actions.backfilling', 'Backfilling…')
              : tp('adminDocumentation.actions.backfillTranslations', 'Backfill Translations')}
          </button>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={isRefreshing}
            className="btn-secondary text-xs py-2 disabled:opacity-50"
          >
            {isRefreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {tp('adminDocumentation.refresh', 'Refresh')}
          </button>
          <Link
            href="/admin/documentation/new"
            className="btn-primary inline-flex text-xs py-2"
          >
            <FilePlus2 size={14} />
            {tp('adminDocumentation.createAction', 'New Article')}
          </Link>
        </div>
      </div>

      {isBackfilling && (
        <div className="card-elevated border border-info/30 bg-info/5 p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-700 text-info">
            <Languages size={16} />
            {tp('adminDocumentation.backfill.activeLabel', 'Documentation translation backfill in progress')}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {tp(
                'adminDocumentation.backfill.progressLabel',
                'Completed {{completed}} of {{total}} scheduled translations ({{failed}} failed).',
                {
                  completed: String(backfillStats.completed),
                  total: String(backfillStats.total || '—'),
                  failed: String(backfillStats.failed),
                }
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                stopBackfillRef.current = true;
                setStopBackfill(true);
              }}
              disabled={stopBackfill}
              className="btn-secondary !h-8 !text-xs !py-1 disabled:opacity-50"
            >
              {stopBackfill
                ? tp('adminDocumentation.backfill.stopping', 'Stopping…')
                : tp('adminDocumentation.backfill.stop', 'Pause backfill')}
            </button>
          </div>
        </div>
      )}

      <div className="card-elevated p-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <SearchField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tp('adminDocumentation.searchPlaceholder', 'Search title, slug, summary, or category...')}
            aria-label={tp('adminDocumentation.searchPlaceholder', 'Search title, slug, summary, or category...')}
            inputClassName="h-10 rounded-2xl ps-11"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="input-base h-10 text-sm min-w-[130px]"
          >
            <option value="all">{tp('adminDocumentation.filters.allStatuses', 'All statuses')}</option>
            <option value="published">{tp('adminDocumentation.filters.published', 'Published')}</option>
            <option value="draft">{tp('adminDocumentation.filters.draft', 'Draft')}</option>
          </select>
          <select
            value={enabledFilter}
            onChange={(e) => setEnabledFilter(e.target.value as EnabledFilter)}
            className="input-base h-10 text-sm min-w-[130px]"
          >
            <option value="all">{tp('adminDocumentation.filters.allVisibility', 'All visibility')}</option>
            <option value="enabled">{tp('adminDocumentation.filters.enabled', 'Enabled')}</option>
            <option value="disabled">{tp('adminDocumentation.filters.disabled', 'Disabled')}</option>
          </select>
        </div>
      </div>

      {isRefreshing ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-accent" />
        </div>
      ) : filteredArticles.length === 0 && articles.length === 0 ? (
        <div className="card-elevated p-5">
          <EmptyState
            icon={BookOpen}
            title={tp('adminDocumentation.emptyTitle', 'No documentation articles')}
            description={tp('adminDocumentation.emptyDescription', 'Create your first help guide. Published guides appear on the Documentation page.')}
            action={{
              label: tp('adminDocumentation.createAction', 'New Article'),
              onClick: () => router.push('/admin/documentation/new'),
            }}
          />
        </div>
      ) : filteredArticles.length === 0 ? (
        <div className="card-elevated p-5">
          <EmptyState
            icon={Search}
            tone="neutral"
            title={tp('adminDocumentation.noResultsTitle', 'No articles match your filters')}
            description={tp('adminDocumentation.noResultsDescription', 'Adjust the search query or filters.')}
            action={{
              label: tp('adminDocumentation.clearFilters', 'Clear filters'),
              onClick: () => {
                setSearch('');
                setStatusFilter('all');
                setEnabledFilter('all');
              },
            }}
          />
        </div>
      ) : (
        <div className="card-elevated p-2 sm:p-3">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="px-3 py-3 font-700">{tp('adminDocumentation.columns.title', 'Title')}</th>
                  <th className="px-3 py-3 font-700">{tp('adminDocumentation.columns.category', 'Category')}</th>
                  <th className="px-3 py-3 font-700">{tp('adminDocumentation.columns.translations', 'Translations')}</th>
                  <th className="px-3 py-3 font-700">{tp('adminDocumentation.columns.status', 'Status')}</th>
                  <th className="px-3 py-3 font-700">{tp('adminDocumentation.columns.enabled', 'Visible')}</th>
                  <th className="px-3 py-3 font-700">{tp('adminDocumentation.columns.order', 'Order')}</th>
                  <th className="px-3 py-3 font-700">{tp('adminDocumentation.columns.updated', 'Updated')}</th>
                  <th className="px-3 py-3 font-700 text-end">{tp('adminDocumentation.columns.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredArticles.map((article) => {
                  const status = translationStatuses[article.id];
                  const cov = translationCoverage(status);
                  return (
                    <tr key={article.id} className="align-top">
                      <td className="px-3 py-3 min-w-[220px]">
                        <div>
                          <p className="text-sm font-700 text-foreground">{article.title}</p>
                          <p className="mt-0.5 text-xs font-mono text-muted-foreground">/{article.slug}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11px] font-700 text-muted-foreground">
                          {displayCategoryLabel(article.category)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-800 tabular-nums ${
                          cov.tone === 'positive'
                            ? 'bg-positive-soft text-positive'
                            : cov.tone === 'warning'
                            ? 'bg-warning/10 text-warning'
                            : cov.tone === 'danger'
                            ? 'bg-negative-soft text-negative'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          <Languages size={11} />
                          {cov.current}/{cov.total}
                        </span>
                        {status && status.failedCount > 0 ? (
                          <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-negative-soft px-2 py-1 text-[10px] font-700 text-negative">
                            <ShieldAlert size={10} />
                            {tp(
                              'adminDocumentation.columns.failedCountLabel',
                              '{{count}} failed',
                              { count: String(status.failedCount) }
                            )}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-700 uppercase ${
                          article.status === 'published'
                            ? 'bg-positive-soft text-positive'
                            : 'bg-warning/10 text-warning'
                        }`}>
                          {article.status}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-700 ${
                          article.enabled
                            ? 'bg-info-soft text-info'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {article.enabled
                            ? tp('adminDocumentation.labels.enabled', 'Enabled')
                            : tp('adminDocumentation.labels.disabled', 'Disabled')}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="tabular-nums text-xs text-muted-foreground">{article.display_order}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs text-muted-foreground tabular-nums">{formatDate(article.updated_at)}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {article.status === 'published' && article.enabled ? (
                            <Link
                              href={`/help/documentation/${article.slug}`}
                              target="_blank"
                              className="btn-secondary inline-flex !h-7 !min-h-0 !rounded-lg !px-2 !text-[11px]"
                              title={tp('adminDocumentation.actions.viewPublic', 'View public page')}
                            >
                              <Eye size={12} />
                            </Link>
                          ) : null}
                          <Link
                            href={`/admin/documentation/${article.id}/edit`}
                            className="btn-secondary inline-flex !h-7 !min-h-0 !rounded-lg !px-2 !text-[11px]"
                            title={tp('adminDocumentation.actions.edit', 'Edit')}
                          >
                            <Pencil size={12} />
                          </Link>
                          <button
                            type="button"
                            onClick={() => void toggleStatus(article)}
                            disabled={isSaving || isBackfilling}
                            className="btn-secondary inline-flex !h-7 !min-h-0 !rounded-lg !px-2 !text-[11px] disabled:opacity-50"
                            title={
                              article.status === 'published'
                                ? tp('adminDocumentation.actions.unpublish', 'Move to draft')
                                : tp('adminDocumentation.actions.publish', 'Publish')
                            }
                          >
                            {article.status === 'published' ? tp('adminDocumentation.actions.unpublishShort', 'Draft') : tp('adminDocumentation.actions.publishShort', 'Pub')}
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleEnabled(article)}
                            disabled={isSaving || isBackfilling}
                            className="btn-secondary inline-flex !h-7 !min-h-0 !rounded-lg !px-2 !text-[11px] disabled:opacity-50"
                            title={
                              article.enabled
                                ? tp('adminDocumentation.actions.disable', 'Disable')
                                : tp('adminDocumentation.actions.enable', 'Enable')
                            }
                          >
                            {article.enabled ? tp('adminDocumentation.actions.disableShort', 'Off') : tp('adminDocumentation.actions.enableShort', 'On')}
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmDelete(article)}
                            disabled={isSaving || isBackfilling}
                            className="btn-secondary inline-flex !h-7 !min-h-0 !rounded-lg !px-2 !text-[11px] text-negative disabled:opacity-50"
                            title={tp('adminDocumentation.actions.delete', 'Delete')}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmationModal
        open={Boolean(deleteState)}
        title={tp('adminDocumentation.deleteTitle', 'Delete documentation article?')}
        description={
          deleteState
            ? tp(
                'adminDocumentation.deleteDescription',
                'The article "{{title}}" will be permanently removed. This action cannot be undone.',
                { title: deleteState.title }
              )
            : ''
        }
        confirmLabel={tp('adminDocumentation.deleteConfirm', 'Delete article')}
        tone="danger"
        cancelLabel={tp('adminDocumentation.deleteCancel', 'Cancel')}
        onClose={() => setDeleteState(null)}
        onConfirm={() => void handleDelete()}
        pending={isSaving}
      />
    </div>
  );
}
