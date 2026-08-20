'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  DatabaseBackup,
  Eye,
  FilePlus2,
  FolderPlus,
  Languages,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Square,
  Tags,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import SearchField from '@/components/ui/SearchField';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import type {
  DocumentationArticleRecord,
  DocumentationCategoryInput,
  DocumentationCategoryRecord,
  DocumentationCategoryWithCount,
  DocumentationTranslationStatusResponse,
} from '@/lib/documentation';
import {
  DOCUMENTATION_CATEGORIES,
  normalizeDocumentationCategoryInput,
  validateDocumentationCategoryInput,
} from '@/lib/documentation';
import { slugifyCmsPageSlug } from '@/lib/cms-pages';
import { CONTENT_TRANSLATION_ENABLED_LANGS } from '@/i18n/registry';

type StatusFilter = 'all' | 'draft' | 'published';
type EnabledFilter = 'all' | 'enabled' | 'disabled';
type AdminTab = 'articles' | 'categories';

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
  initialCategories,
}: {
  initialArticles: DocumentationArticleRecord[];
  initialTranslationStatuses?: Record<string, DocumentationTranslationStatusResponse>;
  initialCategories?: DocumentationCategoryWithCount[];
}) {
  const { t } = useTranslation('portal');
  const router = useRouter();
  const [tab, setTab] = React.useState<AdminTab>('articles');

  // Articles state
  const [articles, setArticles] = React.useState(initialArticles);
  const [translationStatuses, setTranslationStatuses] = React.useState<Record<string, DocumentationTranslationStatusResponse>>(
    initialTranslationStatuses ?? {}
  );
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [enabledFilter, setEnabledFilter] = React.useState<EnabledFilter>('all');
  const [deleteArticleState, setDeleteArticleState] = React.useState<{
    id: string;
    title: string;
  } | null>(null);

  const [isBackfilling, setIsBackfilling] = React.useState(false);
  const [backfillActiveId, setBackfillActiveId] = React.useState<string | null>(null);
  const [backfillStats, setBackfillStats] = React.useState({ completed: 0, total: 0, failed: 0 });
  const stopBackfillRef = React.useRef(false);
  const [stopBackfill, setStopBackfill] = React.useState(false);

  // Categories state
  const [categories, setCategories] = React.useState<DocumentationCategoryWithCount[]>(initialCategories ?? []);
  const [categoriesSearch, setCategoriesSearch] = React.useState('');
  const [isCategoriesRefreshing, setIsCategoriesRefreshing] = React.useState(false);
  const [isCategoriesSaving, setIsCategoriesSaving] = React.useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = React.useState(false);
  const [editingCategory, setEditingCategory] = React.useState<DocumentationCategoryRecord | null>(null);
  const [deleteCategoryState, setDeleteCategoryState] = React.useState<{
    id: string;
    name: string;
    slug: string;
    articlesCount: number;
  } | null>(null);

  const tp = React.useCallback(
    (key: string, defaultValue: string, options?: Record<string, unknown>) =>
      t(key, { ns: 'portal', defaultValue, ...options }),
    [t]
  );

  // ====== ARTICLES LOGIC (kept unchanged for existing Articles tab) ======
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

  const reloadArticles = React.useCallback(async () => {
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
      await reloadArticles();
    }
  }, [tp, processWorkItems, reloadArticles]);

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
      await reloadArticles();
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
      await reloadArticles();
    } catch (error: any) {
      toast.error(error?.message || tp('adminDocumentation.errors.toggleEnabled', 'Failed to update enabled status.'));
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteArticle = (article: DocumentationArticleRecord) => {
    setDeleteArticleState({ id: article.id, title: article.title });
  };

  const handleDeleteArticle = async () => {
    if (!deleteArticleState) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/documentation/${deleteArticleState.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || tp('adminDocumentation.errors.delete', 'Failed to delete article.'));
      }
      toast.success(tp('adminDocumentation.toasts.deleted', 'Article deleted.'));
      setDeleteArticleState(null);
      await reloadArticles();
    } catch (error: any) {
      toast.error(error?.message || tp('adminDocumentation.errors.delete', 'Failed to delete article.'));
    } finally {
      setIsSaving(false);
    }
  };

  // ====== CATEGORIES LOGIC ======
  const reloadCategories = React.useCallback(async () => {
    setIsCategoriesRefreshing(true);
    try {
      const res = await fetch('/api/admin/documentation/categories', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || tp('adminDocumentation.errors.categoriesLoad', 'Failed to load categories.'));
      setCategories((json?.categories || []) as DocumentationCategoryWithCount[]);
    } catch (error: any) {
      toast.error(error?.message || tp('adminDocumentation.errors.categoriesRefresh', 'Failed to refresh categories.'));
    } finally {
      setIsCategoriesRefreshing(false);
    }
  }, [tp]);

  const filteredCategories = React.useMemo(() => {
    const q = categoriesSearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
    );
  }, [categories, categoriesSearch]);

  const openCreateCategory = () => {
    setEditingCategory(null);
    setCategoryModalOpen(true);
  };

  const openEditCategory = (cat: DocumentationCategoryRecord) => {
    setEditingCategory(cat);
    setCategoryModalOpen(true);
  };

  const toggleCategoryActive = async (cat: DocumentationCategoryWithCount) => {
    setIsCategoriesSaving(true);
    try {
      const res = await fetch(`/api/admin/documentation/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !cat.is_active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || tp('adminDocumentation.errors.categoryToggle', 'Failed to toggle status.'));
      toast.success(
        cat.is_active
          ? tp('adminDocumentation.toasts.categoryDeactivated', 'Category deactivated.')
          : tp('adminDocumentation.toasts.categoryActivated', 'Category activated.')
      );
      await reloadCategories();
    } catch (error: any) {
      toast.error(error?.message || tp('adminDocumentation.errors.categoryToggle', 'Failed to toggle status.'));
    } finally {
      setIsCategoriesSaving(false);
    }
  };

  const confirmDeleteCategory = (cat: DocumentationCategoryWithCount) => {
    setDeleteCategoryState({ id: cat.id, name: cat.name, slug: cat.slug, articlesCount: cat.articles_count });
  };

  const handleDeleteCategory = async () => {
    if (!deleteCategoryState) return;
    setIsCategoriesSaving(true);
    try {
      const res = await fetch(`/api/admin/documentation/categories/${deleteCategoryState.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || tp('adminDocumentation.errors.categoryDelete', 'Failed to delete category.'));
      toast.success(tp('adminDocumentation.toasts.categoryDeleted', 'Category deleted.'));
      setDeleteCategoryState(null);
      await reloadCategories();
    } catch (error: any) {
      toast.error(error?.message || tp('adminDocumentation.errors.categoryDelete', 'Failed to delete category.'));
    } finally {
      setIsCategoriesSaving(false);
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

  // ====== ARTICLES TAB RETURN ======
  const renderArticlesTab = () => (
    <>
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
                            onClick={() => confirmDeleteArticle(article)}
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
        open={Boolean(deleteArticleState)}
        title={tp('adminDocumentation.deleteTitle', 'Delete documentation article?')}
        description={
          deleteArticleState
            ? tp(
                'adminDocumentation.deleteDescription',
                'The article "{{title}}" will be permanently removed. This action cannot be undone.',
                { title: deleteArticleState.title }
              )
            : ''
        }
        confirmLabel={tp('adminDocumentation.deleteConfirm', 'Delete article')}
        tone="danger"
        cancelLabel={tp('adminDocumentation.deleteCancel', 'Cancel')}
        onClose={() => setDeleteArticleState(null)}
        onConfirm={() => void handleDeleteArticle()}
        pending={isSaving}
      />
    </>
  );

  // ====== CATEGORIES TAB RETURN ======
  const renderCategoriesTab = () => (
    <>
      <div className="card-elevated p-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <SearchField
            value={categoriesSearch}
            onChange={(e) => setCategoriesSearch(e.target.value)}
            placeholder={tp('adminDocumentation.categories.searchPlaceholder', 'Search category name, slug, or description...')}
            aria-label={tp('adminDocumentation.categories.searchPlaceholder', 'Search category name, slug, or description...')}
            inputClassName="h-10 rounded-2xl ps-11"
          />
          <button
            type="button"
            onClick={openCreateCategory}
            disabled={isCategoriesSaving}
            className="btn-primary inline-flex h-10 items-center justify-center gap-2 text-xs disabled:opacity-50"
          >
            <FolderPlus size={14} />
            {tp('adminDocumentation.categories.newAction', 'New Category')}
          </button>
        </div>
      </div>

      {isCategoriesRefreshing ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-accent" />
        </div>
      ) : filteredCategories.length === 0 && categories.length === 0 ? (
        <div className="card-elevated p-5">
          <EmptyState
            icon={Tags}
            title={tp('adminDocumentation.categories.emptyTitle', 'No documentation categories')}
            description={tp('adminDocumentation.categories.emptyDescription', 'Create a category first, then assign articles to organize your docs.')}
            action={{
              label: tp('adminDocumentation.categories.newAction', 'New Category'),
              onClick: openCreateCategory,
            }}
          />
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="card-elevated p-5">
          <EmptyState
            icon={Search}
            tone="neutral"
            title={tp('adminDocumentation.categories.noResultsTitle', 'No categories match your search')}
            description={tp('adminDocumentation.categories.noResultsDescription', 'Try a different keyword or clear the search.')}
            action={{
              label: tp('adminDocumentation.clearFilters', 'Clear filters'),
              onClick: () => setCategoriesSearch(''),
            }}
          />
        </div>
      ) : (
        <div className="card-elevated p-2 sm:p-3">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="px-3 py-3 font-700">{tp('adminDocumentation.categories.columns.name', 'Name')}</th>
                  <th className="px-3 py-3 font-700">{tp('adminDocumentation.categories.columns.slug', 'Slug')}</th>
                  <th className="px-3 py-3 font-700">{tp('adminDocumentation.categories.columns.status', 'Status')}</th>
                  <th className="px-3 py-3 font-700">{tp('adminDocumentation.categories.columns.order', 'Order')}</th>
                  <th className="px-3 py-3 font-700">{tp('adminDocumentation.categories.columns.articles', 'Articles')}</th>
                  <th className="px-3 py-3 font-700">{tp('adminDocumentation.categories.columns.updated', 'Updated')}</th>
                  <th className="px-3 py-3 font-700 text-end">{tp('adminDocumentation.columns.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCategories.map((cat) => (
                  <tr key={cat.id} className="align-top">
                    <td className="px-3 py-3 min-w-[180px]">
                      <div>
                        <p className="text-sm font-700 text-foreground">{cat.name}</p>
                        {cat.description ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{cat.description}</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-mono text-xs text-muted-foreground">{cat.slug || '—'}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-700 ${
                        cat.is_active
                          ? 'bg-positive-soft text-positive'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {cat.is_active
                          ? tp('adminDocumentation.labels.active', 'Active')
                          : tp('adminDocumentation.labels.inactive', 'Inactive')}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="tabular-nums text-xs text-muted-foreground">{cat.display_order}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`tabular-nums text-xs ${
                        cat.articles_count > 0 ? 'text-foreground font-700' : 'text-muted-foreground'
                      }`}>
                        {cat.articles_count}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs text-muted-foreground tabular-nums">{formatDate(cat.updated_at)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void toggleCategoryActive(cat)}
                          disabled={isCategoriesSaving}
                          className="btn-secondary inline-flex !h-7 !min-h-0 !rounded-lg !px-2 !text-[11px] disabled:opacity-50"
                          title={
                            cat.is_active
                              ? tp('adminDocumentation.categories.actions.deactivate', 'Deactivate')
                              : tp('adminDocumentation.categories.actions.activate', 'Activate')
                          }
                        >
                          {cat.is_active ? (
                            <><ToggleRight size={12} className="text-positive" /></>
                          ) : (
                            <><ToggleLeft size={12} /></>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditCategory(cat)}
                          disabled={isCategoriesSaving}
                          className="btn-secondary inline-flex !h-7 !min-h-0 !rounded-lg !px-2 !text-[11px] disabled:opacity-50"
                          title={tp('adminDocumentation.actions.edit', 'Edit')}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmDeleteCategory(cat)}
                          disabled={isCategoriesSaving}
                          className="btn-secondary inline-flex !h-7 !min-h-0 !rounded-lg !px-2 !text-[11px] text-negative disabled:opacity-50"
                          title={tp('adminDocumentation.actions.delete', 'Delete')}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CategoryFormModal
        open={categoryModalOpen}
        editing={editingCategory}
        onClose={() => setCategoryModalOpen(false)}
        onSaved={() => {
          setCategoryModalOpen(false);
          void reloadCategories();
        }}
        tp={tp}
      />

      <ConfirmationModal
        open={Boolean(deleteCategoryState)}
        title={tp('adminDocumentation.categories.deleteTitle', 'Delete documentation category?')}
        description={
          deleteCategoryState
            ? deleteCategoryState.articlesCount > 0
              ? tp(
                  'adminDocumentation.categories.deleteBlocked',
                  'Cannot delete "{{name}}" — {{count}} article(s) are still assigned to this category. Reassign them first.',
                  { name: deleteCategoryState.name, count: String(deleteCategoryState.articlesCount) }
                )
              : tp(
                  'adminDocumentation.categories.deleteDescription',
                  'Category "{{name}}" will be permanently removed. This action cannot be undone.',
                  { name: deleteCategoryState.name }
                )
            : ''
        }
        confirmLabel={tp('adminDocumentation.categories.deleteConfirm', 'Delete category')}
        tone="danger"
        cancelLabel={tp('adminDocumentation.categories.deleteCancel', 'Cancel')}
        onClose={() => setDeleteCategoryState(null)}
        onConfirm={() => {
          if (deleteCategoryState && deleteCategoryState.articlesCount > 0) {
            toast.error(
              tp(
                'adminDocumentation.categories.deleteBlockedShort',
                'Reassign articles in this category before deleting.'
              )
            );
            setDeleteCategoryState(null);
            return;
          }
          void handleDeleteCategory();
        }}
        pending={isCategoriesSaving}
      />
    </>
  );

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
          {tab === 'articles' ? (
            <>
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
                onClick={() => void reloadArticles()}
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
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void reloadCategories()}
                disabled={isCategoriesRefreshing}
                className="btn-secondary text-xs py-2 disabled:opacity-50"
              >
                {isCategoriesRefreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {tp('adminDocumentation.refresh', 'Refresh')}
              </button>
              <button
                type="button"
                onClick={openCreateCategory}
                disabled={isCategoriesSaving}
                className="btn-primary inline-flex text-xs py-2 disabled:opacity-50"
              >
                <FolderPlus size={14} />
                {tp('adminDocumentation.categories.newAction', 'New Category')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card-elevated p-2">
        <div
          role="tablist"
          aria-label={tp('adminDocumentation.tabs.label', 'Documentation management tabs')}
          className="grid grid-cols-2 gap-1 rounded-2xl bg-muted/50 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'articles'}
            onClick={() => setTab('articles')}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-700 transition-colors ${
              tab === 'articles'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BookOpen size={13} />
            {tp('adminDocumentation.tabs.articles', 'Articles')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'categories'}
            onClick={() => setTab('categories')}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-700 transition-colors ${
              tab === 'categories'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <SlidersHorizontal size={13} />
            {tp('adminDocumentation.tabs.categories', 'Categories')}
          </button>
        </div>
      </div>

      {isBackfilling && tab === 'articles' ? (
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
      ) : null}

      {tab === 'articles' ? renderArticlesTab() : renderCategoriesTab()}
    </div>
  );
}

function CategoryFormModal({
  open,
  editing,
  onClose,
  onSaved,
  tp,
}: {
  open: boolean;
  editing: DocumentationCategoryRecord | null;
  onClose: () => void;
  onSaved: () => void;
  tp: (key: string, defaultValue: string, options?: Record<string, unknown>) => string;
}) {
  const isEditing = Boolean(editing);
  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [displayOrder, setDisplayOrder] = React.useState<number>(0);
  const [isActive, setIsActive] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string | null>>({});
  const slugLockedRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) return;
    slugLockedRef.current = false;
    if (editing) {
      setName(editing.name);
      setSlug(editing.slug);
      setDescription(editing.description);
      setDisplayOrder(Number(editing.display_order) || 0);
      setIsActive(editing.is_active !== false);
      slugLockedRef.current = true;
    } else {
      setName('');
      setSlug('');
      setDescription('');
      setDisplayOrder(0);
      setIsActive(true);
    }
    setErrors({});
  }, [open, editing]);

  const autoSlug = (value: string) => {
    if (slugLockedRef.current) return;
    setSlug(slugifyCmsPageSlug(value));
  };

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const payload = normalizeDocumentationCategoryInput({
      name,
      slug,
      description,
      display_order: Number(displayOrder),
      is_active: isActive,
    });
    const result = validateDocumentationCategoryInput(payload);
    const map: Record<string, string | null> = {};
    for (const issue of result.issues) {
      if (issue.field) map[issue.field] = map[issue.field] || issue.message;
    }
    setErrors(map);
    if (!result.valid) {
      toast.error(tp('adminDocumentation.errors.validation', 'Please fix the highlighted fields.'));
      return;
    }
    setSaving(true);
    try {
      const url = isEditing
        ? `/api/admin/documentation/categories/${editing!.id}`
        : '/api/admin/documentation/categories';
      const res = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || (isEditing ? 'Failed to update category.' : 'Failed to create category.'));
      toast.success(
        isEditing
          ? tp('adminDocumentation.toasts.categoryUpdated', 'Category updated.')
          : tp('adminDocumentation.toasts.categoryCreated', 'Category created.')
      );
      onSaved();
    } catch (error: any) {
      toast.error(error?.message || (isEditing ? 'Failed to save category.' : 'Failed to create category.'));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? tp('adminDocumentation.categories.modal.editTitle', 'Edit category') : tp('adminDocumentation.categories.modal.createTitle', 'Create category')}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-[22px] border border-border bg-card shadow-card-md sm:rounded-[24px]">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h3 className="text-lg font-800 text-foreground">
              {isEditing
                ? tp('adminDocumentation.categories.modal.editTitle', 'Edit category')
                : tp('adminDocumentation.categories.modal.createTitle', 'Create category')}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {tp('adminDocumentation.categories.modal.help', 'Categories organize public documentation filter chips and article cards.')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary inline-flex !h-8 !min-h-0 !rounded-lg !px-2 !text-[11px]"
            aria-label={tp('adminDocumentation.categories.modal.close', 'Close')}
          >
            <X size={14} />
          </button>
        </div>
        <form
          onSubmit={(e) => void submit(e)}
          className="space-y-4 px-5 py-5"
        >
          <div>
            <label className="block mb-1.5 text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground">
              {tp('adminDocumentation.categories.modal.fieldName', 'Name')} <span className="text-negative">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                autoSlug(e.target.value);
              }}
              maxLength={120}
              className="input-base"
              placeholder={tp('adminDocumentation.categories.modal.namePlaceholder', 'e.g. AI Smart Entry')}
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name ? (
              <p className="mt-1 text-[11px] font-700 text-negative">{errors.name}</p>
            ) : null}
          </div>
          <div>
            <label className="block mb-1.5 text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground">
              {tp('adminDocumentation.categories.modal.fieldSlug', 'Slug')} <span className="text-negative">*</span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                slugLockedRef.current = true;
                setSlug(e.target.value);
              }}
              className="input-base font-mono text-xs"
              placeholder={tp('adminDocumentation.categories.modal.slugPlaceholder', 'e.g. ai-smart-entry')}
              aria-invalid={Boolean(errors.slug)}
            />
            {errors.slug ? (
              <p className="mt-1 text-[11px] font-700 text-negative">{errors.slug}</p>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {tp('adminDocumentation.categories.modal.slugHelp', 'Auto-derived from name. Change only if needed.')}
              </p>
            )}
          </div>
          <div>
            <label className="block mb-1.5 text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground">
              {tp('adminDocumentation.categories.modal.fieldDescription', 'Description')}
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              className="input-base resize-y"
              placeholder={tp('adminDocumentation.categories.modal.descriptionPlaceholder', 'Short description shown to admins (optional).')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1.5 text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground">
                {tp('adminDocumentation.field.displayOrder', 'Display order')}
              </label>
              <input
                type="number"
                min={-9999}
                max={9999}
                value={displayOrder}
                onChange={(e) => setDisplayOrder(Number(e.target.value))}
                className="input-base"
              />
            </div>
            <div>
              <label className="block mb-1.5 text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground">
                {tp('adminDocumentation.categories.modal.fieldActive', 'Active')}
              </label>
              <button
                type="button"
                onClick={() => setIsActive((v) => !v)}
                className={`input-base flex h-10 items-center justify-between px-3 ${
                  isActive ? 'text-positive' : 'text-muted-foreground'
                }`}
                aria-pressed={isActive}
              >
                <span className="text-xs font-700">
                  {isActive
                    ? tp('adminDocumentation.labels.active', 'Active')
                    : tp('adminDocumentation.labels.inactive', 'Inactive')}
                </span>
                {isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-xs py-2"
              disabled={saving}
            >
              {tp('adminDocumentation.categories.modal.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              className="btn-primary text-xs py-2"
              disabled={saving}
            >
              {saving ? (
                <><Loader2 size={14} className="animate-spin" />&nbsp;</>
              ) : null}
              {isEditing
                ? tp('adminDocumentation.categories.modal.save', 'Save changes')
                : tp('adminDocumentation.categories.modal.create', 'Create category')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
