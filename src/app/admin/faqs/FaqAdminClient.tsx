'use client';

import React from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Copy,
  Eye,
  FileQuestion,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import SearchField from '@/components/ui/SearchField';
import RichTextEditor from '@/components/cms/RichTextEditor';
import CmsHtml from '@/components/cms/CmsHtml';
import SupportConfirmationModal from '@/components/support/SupportConfirmationModal';
import FaqCategoryIcon from '@/components/faqs/FaqCategoryIcon';
import type { AdminFaqCategory, AdminFaqDashboardData, AdminFaqItem } from '@/lib/faqs-server';
import {
  FAQ_ICON_OPTIONS,
  FAQ_LANGUAGES,
  createEmptyFaqCategoryTranslations,
  createEmptyFaqItemTranslations,
  formatFaqHash,
  keywordArrayToString,
  keywordStringToArray,
  normalizeFaqCategoryInput,
  normalizeFaqItemInput,
  type FaqCategoryInput,
  type FaqItemInput,
  type FaqLanguageCode,
} from '@/lib/faqs';

type CategoryModalState = {
  open: boolean;
  mode: 'create' | 'edit';
  form: FaqCategoryInput;
  editingId: string | null;
  activeLanguage: FaqLanguageCode;
};

type ItemModalState = {
  open: boolean;
  mode: 'create' | 'edit' | 'duplicate';
  form: FaqItemInput;
  editingId: string | null;
  activeLanguage: FaqLanguageCode;
};

type DeleteState =
  | {
      type: 'category';
      id: string;
      title: string;
      description: string;
      force?: boolean;
    }
  | {
      type: 'item';
      id: string;
      title: string;
      description: string;
    }
  | null;

type AdminFaqView = 'categories' | 'items';

const EMPTY_CATEGORY_FORM = normalizeFaqCategoryInput({
  slug: '',
  icon: 'circle-help',
  sort_order: 0,
  is_active: true,
  translations: createEmptyFaqCategoryTranslations(),
});

const EMPTY_ITEM_FORM = normalizeFaqItemInput({
  category_id: '',
  slug: '',
  sort_order: 0,
  is_active: true,
  is_featured: false,
  translations: createEmptyFaqItemTranslations(),
});

const CATEGORY_ICON_LABELS: Record<string, string> = {
  rocket: 'Rocket',
  sparkles: 'Sparkles',
  receipt: 'Receipt',
  wallet: 'Wallet',
  'credit-card': 'Card',
  'piggy-bank': 'Budget',
  repeat: 'Recurring',
  'rotate-ccw': 'Reimbursements',
  handshake: 'Settlements',
  users: 'People',
  'life-buoy': 'Support',
  'circle-help': 'Help',
  bot: 'AI',
  'folder-kanban': 'General',
};

const COMPACT_ACTION_BUTTON_CLASS =
  'btn-secondary !h-6 !min-h-0 !rounded-md !px-1.5 !py-0 !text-[10px] !leading-none !gap-1 whitespace-nowrap';
const COMPACT_ACTION_LINK_CLASS =
  'btn-secondary inline-flex !h-6 !min-h-0 !rounded-md !px-1.5 !py-0 !text-[10px] !leading-none !gap-1 whitespace-nowrap';
const COMPACT_ACTION_ICON_CLASS = 'h-2.5 w-2.5';

function formatMissingFieldLabel(field: string) {
  switch (field) {
    case 'answer_html':
      return 'answer';
    default:
      return field.replace(/_/g, ' ');
  }
}

function TranslationStatusBadges({
  states,
}: {
  states: Array<{ language: FaqLanguageCode; isComplete: boolean }>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {states.map((state) => (
        <span
          key={state.language}
          className={`rounded-full px-2 py-1 text-[10px] font-700 uppercase tracking-[0.12em] ${
            state.isComplete
              ? 'bg-positive-soft text-positive'
              : 'bg-warning/10 text-warning'
          }`}
        >
          {state.language}
        </span>
      ))}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="h-full rounded-2xl border border-border bg-card p-4 shadow-card-sm">
      <p className="text-xs font-700 uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-800 text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export default function FaqAdminClient({
  initialData,
}: {
  initialData: AdminFaqDashboardData;
}) {
  const { t } = useTranslation('portal');
  const tp = React.useCallback(
    (key: string, defaultValue: string, options?: Record<string, unknown>) =>
      t(key, { ns: 'portal', defaultValue, ...options }),
    [t]
  );
  const [categories, setCategories] = React.useState(initialData.categories);
  const [items, setItems] = React.useState(initialData.items);
  const [metrics, setMetrics] = React.useState(initialData.metrics);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [categorySearch, setCategorySearch] = React.useState('');
  const [itemSearch, setItemSearch] = React.useState('');
  const [itemCategoryFilter, setItemCategoryFilter] = React.useState('all');
  const [itemStatusFilter, setItemStatusFilter] = React.useState<'all' | 'active' | 'inactive'>('all');
  const [itemFeaturedFilter, setItemFeaturedFilter] = React.useState<'all' | 'featured' | 'standard'>('all');
  const [activeView, setActiveView] = React.useState<AdminFaqView>('categories');
  const [categoryModal, setCategoryModal] = React.useState<CategoryModalState>({
    open: false,
    mode: 'create',
    form: EMPTY_CATEGORY_FORM,
    editingId: null,
    activeLanguage: 'en',
  });
  const [itemModal, setItemModal] = React.useState<ItemModalState>({
    open: false,
    mode: 'create',
    form: EMPTY_ITEM_FORM,
    editingId: null,
    activeLanguage: 'en',
  });
  const [deleteState, setDeleteState] = React.useState<DeleteState>(null);

  const languageLabels = React.useMemo(
    () => ({
      en: tp('adminFaqs.languages.en', 'English'),
      ar: tp('adminFaqs.languages.ar', 'Arabic'),
      fr: tp('adminFaqs.languages.fr', 'French'),
      ru: tp('adminFaqs.languages.ru', 'Russian'),
    }) satisfies Record<FaqLanguageCode, string>,
    [tp]
  );

  const iconLabels = React.useMemo(
    () => ({
      rocket: tp('adminFaqs.iconLabels.rocket', CATEGORY_ICON_LABELS.rocket),
      sparkles: tp('adminFaqs.iconLabels.sparkles', CATEGORY_ICON_LABELS.sparkles),
      receipt: tp('adminFaqs.iconLabels.receipt', CATEGORY_ICON_LABELS.receipt),
      wallet: tp('adminFaqs.iconLabels.wallet', CATEGORY_ICON_LABELS.wallet),
      'credit-card': tp('adminFaqs.iconLabels.creditCard', CATEGORY_ICON_LABELS['credit-card']),
      'piggy-bank': tp('adminFaqs.iconLabels.piggyBank', CATEGORY_ICON_LABELS['piggy-bank']),
      repeat: tp('adminFaqs.iconLabels.repeat', CATEGORY_ICON_LABELS.repeat),
      'rotate-ccw': tp('adminFaqs.iconLabels.rotateCcw', CATEGORY_ICON_LABELS['rotate-ccw']),
      handshake: tp('adminFaqs.iconLabels.handshake', CATEGORY_ICON_LABELS.handshake),
      users: tp('adminFaqs.iconLabels.users', CATEGORY_ICON_LABELS.users),
      'life-buoy': tp('adminFaqs.iconLabels.lifeBuoy', CATEGORY_ICON_LABELS['life-buoy']),
      'circle-help': tp('adminFaqs.iconLabels.circleHelp', CATEGORY_ICON_LABELS['circle-help']),
      bot: tp('adminFaqs.iconLabels.bot', CATEGORY_ICON_LABELS.bot),
      'folder-kanban': tp('adminFaqs.iconLabels.folderKanban', CATEGORY_ICON_LABELS['folder-kanban']),
    }) satisfies Record<string, string>,
    [tp]
  );

  const formatMissingSummary = React.useCallback(
    (states: Array<{ language: FaqLanguageCode; isComplete: boolean; missingFields: string[] }>) => {
      const incomplete = states.filter((state) => !state.isComplete);
      if (incomplete.length === 0) {
        return tp('adminFaqs.translationComplete', 'All translations are complete.');
      }

      return incomplete
        .map((state) => {
          const missingFields = state.missingFields.map((field) =>
            tp(`adminFaqs.fields.${formatMissingFieldLabel(field).replace(/\s+/g, '')}`, formatMissingFieldLabel(field))
          );
          return `${languageLabels[state.language]}: ${missingFields.join(', ')}`;
        })
        .join(' | ');
    },
    [languageLabels, tp]
  );

  const reload = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [categoriesResponse, itemsResponse] = await Promise.all([
        fetch('/api/admin/faqs/categories', { cache: 'no-store' }),
        fetch('/api/admin/faqs/items', { cache: 'no-store' }),
      ]);

      const categoriesJson = await categoriesResponse.json();
      const itemsJson = await itemsResponse.json();

      if (!categoriesResponse.ok) {
        throw new Error(categoriesJson?.error || tp('adminFaqs.errors.loadCategories', 'Failed to load FAQ categories.'));
      }
      if (!itemsResponse.ok) {
        throw new Error(itemsJson?.error || tp('adminFaqs.errors.loadItems', 'Failed to load FAQs.'));
      }

      const nextCategories = (categoriesJson.categories || []) as AdminFaqCategory[];
      const nextItems = (itemsJson.items || []) as AdminFaqItem[];

      setCategories(nextCategories);
      setItems(nextItems);
      setMetrics({
        totalCategories: nextCategories.length,
        publishedFaqs: nextItems.filter((item) => item.is_active).length,
        draftFaqs: nextItems.filter((item) => !item.is_active).length,
        missingTranslations:
          nextCategories.reduce((sum, category) => sum + category.missing_translation_count, 0) +
          nextItems.reduce((sum, item) => sum + item.missing_translation_count, 0),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tp('adminFaqs.errors.refresh', 'Failed to refresh FAQs.'));
    } finally {
      setIsRefreshing(false);
    }
  }, [tp]);

  const filteredCategories = React.useMemo(() => {
    const query = categorySearch.trim().toLowerCase();
    return categories.filter((category) => {
      if (!query) {
        return true;
      }
      return (
        category.slug.toLowerCase().includes(query) ||
        Object.values(category.translations).some((translation) =>
          translation.name.toLowerCase().includes(query) ||
          translation.description.toLowerCase().includes(query)
        )
      );
    });
  }, [categories, categorySearch]);

  const filteredItems = React.useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery =
        !query ||
        item.slug.toLowerCase().includes(query) ||
        item.category_name.toLowerCase().includes(query) ||
        Object.values(item.translations).some((translation) =>
          translation.question.toLowerCase().includes(query) ||
          translation.answer_html.toLowerCase().includes(query) ||
          translation.keywords.some((keyword) => keyword.toLowerCase().includes(query))
        );

      const matchesCategory =
        itemCategoryFilter === 'all' || item.category_id === itemCategoryFilter;
      const matchesStatus =
        itemStatusFilter === 'all' ||
        (itemStatusFilter === 'active' ? item.is_active : !item.is_active);
      const matchesFeatured =
        itemFeaturedFilter === 'all' ||
        (itemFeaturedFilter === 'featured' ? item.is_featured : !item.is_featured);

      return matchesQuery && matchesCategory && matchesStatus && matchesFeatured;
    });
  }, [itemCategoryFilter, itemFeaturedFilter, itemSearch, itemStatusFilter, items]);

  const openCreateCategory = () => {
    setActiveView('categories');
    setCategoryModal({
      open: true,
      mode: 'create',
      editingId: null,
      activeLanguage: 'en',
      form: {
        ...EMPTY_CATEGORY_FORM,
        sort_order: categories.length * 10,
      },
    });
  };

  const openEditCategory = (category: AdminFaqCategory) => {
    setActiveView('categories');
    setCategoryModal({
      open: true,
      mode: 'edit',
      editingId: category.id,
      activeLanguage: 'en',
      form: normalizeFaqCategoryInput({
        slug: category.slug,
        icon: category.icon,
        sort_order: category.sort_order,
        is_active: category.is_active,
        translations: category.translations,
      }),
    });
  };

  const openCreateItem = () => {
    setActiveView('items');
    setItemModal({
      open: true,
      mode: 'create',
      editingId: null,
      activeLanguage: 'en',
      form: {
        ...EMPTY_ITEM_FORM,
        category_id:
          itemCategoryFilter !== 'all' && categories.some((category) => category.id === itemCategoryFilter)
            ? itemCategoryFilter
            : categories[0]?.id || '',
        sort_order: items.length * 10,
      },
    });
  };

  const openEditItem = (item: AdminFaqItem) => {
    setActiveView('items');
    setItemModal({
      open: true,
      mode: 'edit',
      editingId: item.id,
      activeLanguage: 'en',
      form: normalizeFaqItemInput({
        category_id: item.category_id,
        slug: item.slug,
        sort_order: item.sort_order,
        is_active: item.is_active,
        is_featured: item.is_featured,
        translations: item.translations,
      }),
    });
  };

  const openDuplicateItem = (item: AdminFaqItem) => {
    setActiveView('items');
    setItemModal({
      open: true,
      mode: 'duplicate',
      editingId: null,
      activeLanguage: 'en',
      form: normalizeFaqItemInput({
        category_id: item.category_id,
        slug: `${item.slug}-copy`,
        sort_order: item.sort_order + 1,
        is_active: false,
        is_featured: false,
        translations: item.translations,
      }),
    });
  };

  const saveCategory = async () => {
    setIsSaving(true);
    try {
      const endpoint =
        categoryModal.mode === 'create'
          ? '/api/admin/faqs/categories'
          : `/api/admin/faqs/categories/${categoryModal.editingId}`;

      const response = await fetch(endpoint, {
        method: categoryModal.mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryModal.form),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || tp('adminFaqs.errors.saveCategory', 'Failed to save FAQ category.'));
      }

      toast.success(
        categoryModal.mode === 'create'
          ? tp('adminFaqs.toasts.categoryCreated', 'Category created.')
          : tp('adminFaqs.toasts.categoryUpdated', 'Category updated.')
      );
      setCategoryModal((current) => ({ ...current, open: false }));
      await reload();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : tp('adminFaqs.errors.saveCategory', 'Failed to save FAQ category.')
      );
    } finally {
      setIsSaving(false);
    }
  };

  const saveItem = async () => {
    setIsSaving(true);
    try {
      const endpoint =
        itemModal.mode === 'create' || itemModal.mode === 'duplicate'
          ? '/api/admin/faqs/items'
          : `/api/admin/faqs/items/${itemModal.editingId}`;

      const response = await fetch(endpoint, {
        method: itemModal.mode === 'create' || itemModal.mode === 'duplicate' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemModal.form),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || tp('adminFaqs.errors.saveItem', 'Failed to save FAQ.'));
      }

      toast.success(
        itemModal.mode === 'edit'
          ? tp('adminFaqs.toasts.itemUpdated', 'FAQ updated.')
          : itemModal.mode === 'duplicate'
            ? tp('adminFaqs.toasts.itemDuplicated', 'FAQ duplicated as a draft.')
            : tp('adminFaqs.toasts.itemCreated', 'FAQ created.')
      );
      setItemModal((current) => ({ ...current, open: false }));
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tp('adminFaqs.errors.saveItem', 'Failed to save FAQ.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteState) {
      return;
    }

    setIsSaving(true);
    try {
      const endpoint =
        deleteState.type === 'category'
          ? `/api/admin/faqs/categories/${deleteState.id}${deleteState.force ? '?force=true' : ''}`
          : `/api/admin/faqs/items/${deleteState.id}`;

      const response = await fetch(endpoint, {
        method: 'DELETE',
      });
      const json = await response.json();

      if (!response.ok) {
        if (response.status === 409 && deleteState.type === 'category') {
          setDeleteState({
            ...deleteState,
            force: true,
            description: tp(
              'adminFaqs.deleteCategoryCascadeDescription',
              '{{count}} linked FAQs will also be deleted. This action cannot be undone.',
              { count: json?.questionCount || 0 }
            ),
          });
          throw new Error(json?.error || tp('adminFaqs.errors.confirmCategoryDelete', 'Please confirm category deletion.'));
        }
        throw new Error(json?.error || tp('adminFaqs.errors.deleteContent', 'Failed to delete FAQ content.'));
      }

      toast.success(
        deleteState.type === 'category'
          ? tp('adminFaqs.toasts.categoryDeleted', 'Category deleted.')
          : tp('adminFaqs.toasts.itemDeleted', 'FAQ deleted.')
      );
      setDeleteState(null);
      await reload();
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === tp('adminFaqs.errors.confirmCategoryDelete', 'Please confirm category deletion.')
      ) {
        return;
      }
      toast.error(
        error instanceof Error
          ? error.message
          : tp('adminFaqs.errors.deleteContent', 'Failed to delete FAQ content.')
      );
    } finally {
      setIsSaving(false);
    }
  };

  const reorderCategories = async (direction: 'up' | 'down', categoryId: string) => {
    const index = categories.findIndex((category) => category.id === categoryId);
    if (index < 0) {
      return;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) {
      return;
    }

    const next = [...categories];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];

    try {
      const response = await fetch('/api/admin/faqs/categories/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: next.map((category) => category.id) }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || tp('adminFaqs.errors.reorderCategories', 'Failed to reorder categories.'));
      }
      await reload();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : tp('adminFaqs.errors.reorderCategories', 'Failed to reorder categories.')
      );
    }
  };

  const reorderItems = async (direction: 'up' | 'down', item: AdminFaqItem) => {
    const siblings = items
      .filter((entry) => entry.category_id === item.category_id)
      .sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug));

    const index = siblings.findIndex((entry) => entry.id === item.id);
    if (index < 0) {
      return;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) {
      return;
    }

    const next = [...siblings];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];

    try {
      const response = await fetch('/api/admin/faqs/items/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: next.map((entry) => entry.id) }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || tp('adminFaqs.errors.reorderItems', 'Failed to reorder FAQs.'));
      }
      await reload();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : tp('adminFaqs.errors.reorderItems', 'Failed to reorder FAQs.')
      );
    }
  };

  const toggleCategoryStatus = async (category: AdminFaqCategory) => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/faqs/categories/${category.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !category.is_active }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || tp('adminFaqs.errors.toggleCategory', 'Failed to update category status.'));
      }

      toast.success(
        category.is_active
          ? tp('adminFaqs.toasts.categoryDeactivated', 'Category deactivated.')
          : tp('adminFaqs.toasts.categoryActivated', 'Category activated.')
      );
      await reload();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : tp('adminFaqs.errors.toggleCategory', 'Failed to update category status.')
      );
    } finally {
      setIsSaving(false);
    }
  };

  const toggleItemStatus = async (item: AdminFaqItem) => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/faqs/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !item.is_active }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || tp('adminFaqs.errors.toggleItem', 'Failed to update FAQ status.'));
      }

      toast.success(
        item.is_active
          ? tp('adminFaqs.toasts.itemUnpublished', 'FAQ moved to draft.')
          : tp('adminFaqs.toasts.itemPublished', 'FAQ published.')
      );
      await reload();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : tp('adminFaqs.errors.toggleItem', 'Failed to update FAQ status.')
      );
    } finally {
      setIsSaving(false);
    }
  };

  const setCategoryTranslationField = (
    language: FaqLanguageCode,
    field: 'name' | 'description',
    value: string
  ) => {
    setCategoryModal((current) => ({
      ...current,
      form: normalizeFaqCategoryInput({
        ...current.form,
        translations: {
          ...current.form.translations,
          [language]: {
            ...current.form.translations[language],
            [field]: value,
          },
        },
      }),
    }));
  };

  const setItemTranslationField = (
    language: FaqLanguageCode,
    field: 'question' | 'answer_html' | 'keywords',
    value: string
  ) => {
    setItemModal((current) => ({
      ...current,
      form: normalizeFaqItemInput({
        ...current.form,
        translations: {
          ...current.form.translations,
          [language]: {
            ...current.form.translations[language],
            [field]:
              field === 'keywords'
                ? keywordStringToArray(value)
                : value,
          },
        },
      }),
    }));
  };

  return (
    <div className="space-y-6 pb-8 sm:pb-10">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-800 text-foreground">{tp('adminFaqs.title', 'FAQs')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tp(
              'adminFaqs.description',
              'Manage multilingual FAQ categories, published answers, ordering, and public previews from one place.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={openCreateCategory} className="btn-secondary">
            <Plus size={15} />
            {tp('adminFaqs.actions.addCategory', 'Add Category')}
          </button>
          <button type="button" onClick={openCreateItem} className="btn-primary">
            <Plus size={15} />
            {tp('adminFaqs.actions.addItem', 'Add FAQ')}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={tp('adminFaqs.metrics.totalCategories', 'Total Categories')}
          value={metrics.totalCategories}
          hint={tp('adminFaqs.metrics.totalCategoriesHint', 'All category records')}
        />
        <MetricCard
          label={tp('adminFaqs.metrics.publishedFaqs', 'Published FAQs')}
          value={metrics.publishedFaqs}
          hint={tp('adminFaqs.metrics.publishedFaqsHint', 'Visible on the public page')}
        />
        <MetricCard
          label={tp('adminFaqs.metrics.draftFaqs', 'Draft / Inactive')}
          value={metrics.draftFaqs}
          hint={tp('adminFaqs.metrics.draftFaqsHint', 'Hidden from public visitors')}
        />
        <MetricCard
          label={tp('adminFaqs.metrics.missingTranslations', 'Missing Translations')}
          value={metrics.missingTranslations}
          hint={tp('adminFaqs.metrics.missingTranslationsHint', 'Category and FAQ language gaps')}
        />
      </div>

      <div className="rounded-[28px] border border-border bg-card p-2 shadow-card-sm">
        <div role="tablist" aria-label={tp('adminFaqs.title', 'FAQs')} className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            role="tab"
            id="faq-admin-tab-categories"
            aria-selected={activeView === 'categories'}
            aria-controls="faq-admin-panel-categories"
            onClick={() => setActiveView('categories')}
            className={`flex min-h-12 items-center justify-between rounded-2xl border px-4 py-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${
              activeView === 'categories'
                ? 'border-accent bg-accent/10 text-accent shadow-sm'
                : 'border-transparent text-foreground hover:border-border hover:bg-muted/30'
            }`}
          >
            <span className="text-sm font-700">{tp('adminFaqs.sections.categoriesTitle', 'Categories')}</span>
            <span
              dir="ltr"
              className={`inline-flex min-w-8 items-center justify-center rounded-full px-2.5 py-1 text-xs font-700 tabular-nums ${
                activeView === 'categories'
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {categories.length}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            id="faq-admin-tab-items"
            aria-selected={activeView === 'items'}
            aria-controls="faq-admin-panel-items"
            onClick={() => setActiveView('items')}
            className={`flex min-h-12 items-center justify-between rounded-2xl border px-4 py-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${
              activeView === 'items'
                ? 'border-accent bg-accent/10 text-accent shadow-sm'
                : 'border-transparent text-foreground hover:border-border hover:bg-muted/30'
            }`}
          >
            <span className="text-sm font-700">{tp('adminFaqs.sections.itemsTitle', 'FAQ Items')}</span>
            <span
              dir="ltr"
              className={`inline-flex min-w-8 items-center justify-center rounded-full px-2.5 py-1 text-xs font-700 tabular-nums ${
                activeView === 'items'
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {items.length}
            </span>
          </button>
        </div>
      </div>

      {activeView === 'categories' ? (
        <section
          id="faq-admin-panel-categories"
          role="tabpanel"
          aria-labelledby="faq-admin-tab-categories"
          className="space-y-4"
        >
          <div className="rounded-[28px] border border-border bg-card p-4 shadow-card-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-800 text-foreground">{tp('adminFaqs.sections.categoriesTitle', 'Categories')}</h2>
                <p className="text-xs text-muted-foreground">
                  {tp(
                    'adminFaqs.sections.categoriesDescription',
                    'Search, reorder, activate, and edit multilingual category content.'
                  )}
                </p>
              </div>
              {isRefreshing ? <Loader2 size={16} className="animate-spin text-accent" /> : null}
            </div>
            <div className="mt-4">
              <SearchField
                value={categorySearch}
                onChange={(event) => setCategorySearch(event.target.value)}
                placeholder={tp('adminFaqs.searchCategoriesPlaceholder', 'Search categories...')}
                inputClassName="h-10 rounded-2xl ps-10"
              />
            </div>
          </div>

          <div className="rounded-[28px] border border-border bg-card p-3 shadow-card-sm">
            {filteredCategories.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-700 text-foreground">{tp('adminFaqs.emptyCategoriesTitle', 'No categories found.')}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {tp('adminFaqs.emptyCategoriesDescription', 'Adjust the search or create a new category.')}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredCategories.map((category, index) => (
                  <div key={category.id} className="flex h-full flex-col rounded-2xl border border-border p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex w-11 shrink-0 flex-col items-center gap-1 text-center">
                        <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                          <FaqCategoryIcon icon={category.icon} />
                        </span>
                        <span dir="ltr" className="text-[10px] font-600 text-muted-foreground">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-800 text-foreground">{category.translations.en.name || category.slug}</p>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-700 uppercase ${category.is_active ? 'bg-positive-soft text-positive' : 'bg-warning/10 text-warning'}`}>
                            {category.is_active
                              ? tp('adminFaqs.status.active', 'Active')
                              : tp('adminFaqs.status.inactive', 'Inactive')}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-700 uppercase text-muted-foreground">
                            {tp('adminFaqs.counts.categoryItems', '{{count}} FAQs', { count: category.question_count })}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">/{category.slug}</p>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {category.translations.en.description || tp('adminFaqs.fallbacks.noEnglishDescription', 'No English description yet.')}
                        </p>
                        <div className="mt-3">
                          <TranslationStatusBadges states={category.translation_states} />
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            {formatMissingSummary(category.translation_states)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-1">
                      <button type="button" className={COMPACT_ACTION_BUTTON_CLASS} onClick={() => reorderCategories('up', category.id)} disabled={index === 0}>
                        <ArrowUp className={COMPACT_ACTION_ICON_CLASS} />
                        {tp('adminFaqs.actions.moveUp', 'Up')}
                      </button>
                      <button type="button" className={COMPACT_ACTION_BUTTON_CLASS} onClick={() => reorderCategories('down', category.id)} disabled={index === filteredCategories.length - 1}>
                        <ArrowDown className={COMPACT_ACTION_ICON_CLASS} />
                        {tp('adminFaqs.actions.moveDown', 'Down')}
                      </button>
                      <button type="button" className={COMPACT_ACTION_BUTTON_CLASS} onClick={() => void toggleCategoryStatus(category)}>
                        <CheckCircle2 className={COMPACT_ACTION_ICON_CLASS} />
                        {category.is_active
                          ? tp('adminFaqs.actions.deactivateCategory', 'Deactivate')
                          : tp('adminFaqs.actions.activateCategory', 'Activate')}
                      </button>
                      <button type="button" className={COMPACT_ACTION_BUTTON_CLASS} onClick={() => openEditCategory(category)}>
                        <Pencil className={COMPACT_ACTION_ICON_CLASS} />
                        {tp('adminFaqs.actions.edit', 'Edit')}
                      </button>
                      <button
                        type="button"
                        className={COMPACT_ACTION_BUTTON_CLASS}
                        onClick={() =>
                          setDeleteState({
                            type: 'category',
                            id: category.id,
                            title: tp('adminFaqs.deleteCategoryTitle', 'Delete {{name}}?', {
                              name: category.translations.en.name || category.slug,
                            }),
                            description:
                              category.question_count > 0
                                ? tp('adminFaqs.deleteCategoryDescriptionLinked', '{{count}} FAQs are still linked to this category.', {
                                    count: category.question_count,
                                  })
                                : tp('adminFaqs.deleteCategoryDescription', 'This category will be removed permanently.'),
                          })
                        }
                      >
                        <Trash2 className={COMPACT_ACTION_ICON_CLASS} />
                        {tp('adminFaqs.actions.delete', 'Delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section
          id="faq-admin-panel-items"
          role="tabpanel"
          aria-labelledby="faq-admin-tab-items"
          className="space-y-4"
        >
          <div className="rounded-[28px] border border-border bg-card p-4 shadow-card-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-base font-800 text-foreground">{tp('adminFaqs.sections.itemsTitle', 'FAQ Items')}</h2>
                <p className="text-xs text-muted-foreground">
                  {tp(
                    'adminFaqs.sections.itemsDescription',
                    'Search, preview, duplicate, feature, and reorder questions inside each category.'
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary text-xs py-2" onClick={() => void reload()}>
                  {isRefreshing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  {tp('adminFaqs.actions.refresh', 'Refresh')}
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,0.8fr))]">
              <SearchField
                value={itemSearch}
                onChange={(event) => setItemSearch(event.target.value)}
                placeholder={tp('adminFaqs.searchItemsPlaceholder', 'Search questions, answers, or keywords...')}
                inputClassName="h-10 rounded-2xl ps-10"
              />
              <select className="input-base h-10 rounded-2xl text-sm" value={itemCategoryFilter} onChange={(event) => setItemCategoryFilter(event.target.value)}>
                <option value="all">{tp('adminFaqs.filters.allCategories', 'All categories')}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.translations.en.name || category.slug}
                  </option>
                ))}
              </select>
              <select className="input-base h-10 rounded-2xl text-sm" value={itemStatusFilter} onChange={(event) => setItemStatusFilter(event.target.value as typeof itemStatusFilter)}>
                <option value="all">{tp('adminFaqs.filters.allStatuses', 'All statuses')}</option>
                <option value="active">{tp('adminFaqs.status.published', 'Published')}</option>
                <option value="inactive">{tp('adminFaqs.status.inactive', 'Inactive')}</option>
              </select>
              <select className="input-base h-10 rounded-2xl text-sm" value={itemFeaturedFilter} onChange={(event) => setItemFeaturedFilter(event.target.value as typeof itemFeaturedFilter)}>
                <option value="all">{tp('adminFaqs.filters.allVisibility', 'All visibility')}</option>
                <option value="featured">{tp('adminFaqs.status.featured', 'Featured')}</option>
                <option value="standard">{tp('adminFaqs.filters.standard', 'Standard')}</option>
              </select>
            </div>
          </div>

          <div className="rounded-[28px] border border-border bg-card p-3 shadow-card-sm">
            {filteredItems.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <FileQuestion size={24} className="mx-auto text-accent" />
                <p className="mt-3 text-sm font-700 text-foreground">{tp('adminFaqs.emptyItemsTitle', 'No FAQs match the current filters.')}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {tp('adminFaqs.emptyItemsDescription', 'Adjust the filters or add a new FAQ.')}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredItems.map((item, index) => (
                  <div key={item.id} className="flex h-full flex-col rounded-2xl border border-border p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex w-11 shrink-0 flex-col items-center gap-1 text-center">
                        <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                          <FaqCategoryIcon icon={categories.find((category) => category.id === item.category_id)?.icon} />
                        </span>
                        <span dir="ltr" className="text-[10px] font-600 text-muted-foreground">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-800 text-foreground">{item.translations.en.question || item.slug}</p>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-700 uppercase ${item.is_active ? 'bg-positive-soft text-positive' : 'bg-warning/10 text-warning'}`}>
                            {item.is_active
                              ? tp('adminFaqs.status.published', 'Published')
                              : tp('adminFaqs.status.inactive', 'Inactive')}
                          </span>
                          {item.is_featured ? (
                            <span className="rounded-full bg-accent/10 px-2 py-1 text-[10px] font-700 uppercase text-accent">
                              {tp('adminFaqs.status.featured', 'Featured')}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.category_name} · /{item.slug}
                        </p>
                        <div className="mt-3">
                          <TranslationStatusBadges states={item.translation_states} />
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            {formatMissingSummary(item.translation_states)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-1">
                      <button type="button" className={COMPACT_ACTION_BUTTON_CLASS} onClick={() => reorderItems('up', item)}>
                        <ArrowUp className={COMPACT_ACTION_ICON_CLASS} />
                        {tp('adminFaqs.actions.moveUp', 'Up')}
                      </button>
                      <button type="button" className={COMPACT_ACTION_BUTTON_CLASS} onClick={() => reorderItems('down', item)}>
                        <ArrowDown className={COMPACT_ACTION_ICON_CLASS} />
                        {tp('adminFaqs.actions.moveDown', 'Down')}
                      </button>
                      <button type="button" className={COMPACT_ACTION_BUTTON_CLASS} onClick={() => void toggleItemStatus(item)}>
                        <CheckCircle2 className={COMPACT_ACTION_ICON_CLASS} />
                        {item.is_active
                          ? tp('adminFaqs.actions.unpublish', 'Unpublish')
                          : tp('adminFaqs.actions.publish', 'Publish')}
                      </button>
                      <button type="button" className={COMPACT_ACTION_BUTTON_CLASS} onClick={() => openEditItem(item)}>
                        <Pencil className={COMPACT_ACTION_ICON_CLASS} />
                        {tp('adminFaqs.actions.edit', 'Edit')}
                      </button>
                      <button type="button" className={COMPACT_ACTION_BUTTON_CLASS} onClick={() => openDuplicateItem(item)}>
                        <Copy className={COMPACT_ACTION_ICON_CLASS} />
                        {tp('adminFaqs.actions.duplicate', 'Duplicate')}
                      </button>
                      <Link
                        href={`/faqs?category=${item.category_slug}#${formatFaqHash(item.slug)}`}
                        target="_blank"
                        className={COMPACT_ACTION_LINK_CLASS}
                      >
                        <Eye className={COMPACT_ACTION_ICON_CLASS} />
                        {tp('adminFaqs.actions.preview', 'Preview')}
                      </Link>
                      <button
                        type="button"
                        className={COMPACT_ACTION_BUTTON_CLASS}
                        onClick={() =>
                          setDeleteState({
                            type: 'item',
                            id: item.id,
                            title: tp('adminFaqs.deleteItemTitle', 'Delete {{name}}?', {
                              name: item.translations.en.question || item.slug,
                            }),
                            description: tp('adminFaqs.deleteItemDescription', 'This FAQ will be removed permanently.'),
                          })
                        }
                      >
                        <Trash2 className={COMPACT_ACTION_ICON_CLASS} />
                        {tp('adminFaqs.actions.delete', 'Delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <Modal
        isOpen={categoryModal.open}
        onClose={() => setCategoryModal((current) => ({ ...current, open: false }))}
        title={
          categoryModal.mode === 'create'
            ? tp('adminFaqs.modals.addCategoryTitle', 'Add FAQ Category')
            : tp('adminFaqs.modals.editCategoryTitle', 'Edit FAQ Category')
        }
        description={tp(
          'adminFaqs.modals.categoryDescription',
          'Manage icon, order, status, and translations for this category.'
        )}
        size="xl"
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-700 text-foreground">{tp('adminFaqs.fields.slug', 'Slug')}</label>
              <input
                value={categoryModal.form.slug}
                onChange={(event) =>
                  setCategoryModal((current) => ({
                    ...current,
                    form: normalizeFaqCategoryInput({
                      ...current.form,
                      slug: event.target.value,
                    }),
                  }))
                }
                className="input-base"
                placeholder={tp('adminFaqs.placeholders.categorySlug', 'getting-started')}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-700 text-foreground">{tp('adminFaqs.fields.icon', 'Icon')}</label>
              <select
                value={categoryModal.form.icon || 'circle-help'}
                onChange={(event) =>
                  setCategoryModal((current) => ({
                    ...current,
                    form: normalizeFaqCategoryInput({
                      ...current.form,
                      icon: event.target.value,
                    }),
                  }))
                }
                className="input-base"
              >
                {FAQ_ICON_OPTIONS.map((icon) => (
                  <option key={icon} value={icon}>
                    {iconLabels[icon] || icon}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-700 text-foreground">{tp('adminFaqs.fields.sortOrder', 'Sort order')}</label>
              <input
                type="number"
                value={categoryModal.form.sort_order}
                onChange={(event) =>
                  setCategoryModal((current) => ({
                    ...current,
                    form: normalizeFaqCategoryInput({
                      ...current.form,
                      sort_order: Number(event.target.value),
                    }),
                  }))
                }
                className="input-base"
              />
            </div>
            <div className="flex items-center gap-3 pt-7">
              <input
                id="category-active"
                type="checkbox"
                checked={categoryModal.form.is_active}
                onChange={(event) =>
                  setCategoryModal((current) => ({
                    ...current,
                    form: normalizeFaqCategoryInput({
                      ...current.form,
                      is_active: event.target.checked,
                    }),
                  }))
                }
                className="h-4 w-4 rounded border-border accent-accent"
              />
              <label htmlFor="category-active" className="text-sm font-600 text-foreground">
                {tp('adminFaqs.fields.categoryActive', 'Category is active')}
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 overflow-x-auto rounded-2xl bg-muted p-1">
              {FAQ_LANGUAGES.map((language) => (
                <button
                  key={language}
                  type="button"
                  onClick={() => setCategoryModal((current) => ({ ...current, activeLanguage: language }))}
                  className={`rounded-xl px-3 py-2 text-xs font-700 uppercase tracking-[0.12em] ${
                    categoryModal.activeLanguage === language
                      ? 'bg-card text-foreground shadow-card-sm'
                      : 'text-muted-foreground'
                  }`}
                >
                  {languageLabels[language]}
                </button>
              ))}
            </div>

            <div className="grid gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-700 text-foreground">
                  {tp('adminFaqs.translationFieldLabel', '{{language}} name', {
                    language: languageLabels[categoryModal.activeLanguage],
                  })}
                </label>
                <input
                  value={categoryModal.form.translations[categoryModal.activeLanguage].name}
                  onChange={(event) =>
                    setCategoryTranslationField(categoryModal.activeLanguage, 'name', event.target.value)
                  }
                  className="input-base"
                  placeholder={tp('adminFaqs.placeholders.categoryName', 'Category name')}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-700 text-foreground">
                  {tp('adminFaqs.translationDescriptionLabel', '{{language}} description', {
                    language: languageLabels[categoryModal.activeLanguage],
                  })}
                </label>
                <textarea
                  rows={3}
                  value={categoryModal.form.translations[categoryModal.activeLanguage].description}
                  onChange={(event) =>
                    setCategoryTranslationField(categoryModal.activeLanguage, 'description', event.target.value)
                  }
                  className="input-base resize-none"
                  placeholder={tp('adminFaqs.placeholders.categoryDescription', 'Short category description')}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={() => setCategoryModal((current) => ({ ...current, open: false }))}>
              {tp('adminFaqs.actions.cancel', 'Cancel')}
            </button>
            <button type="button" className="btn-primary" onClick={() => void saveCategory()} disabled={isSaving}>
              {isSaving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {categoryModal.mode === 'create'
                ? tp('adminFaqs.actions.createCategory', 'Create Category')
                : tp('adminFaqs.actions.saveCategory', 'Save Category')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={itemModal.open}
        onClose={() => setItemModal((current) => ({ ...current, open: false }))}
        title={
          itemModal.mode === 'edit'
            ? tp('adminFaqs.modals.editItemTitle', 'Edit FAQ')
            : itemModal.mode === 'duplicate'
              ? tp('adminFaqs.modals.duplicateItemTitle', 'Duplicate FAQ')
              : tp('adminFaqs.modals.addItemTitle', 'Add FAQ')
        }
        description={tp(
          'adminFaqs.modals.itemDescription',
          'Edit category, featured status, ordering, and translations for this FAQ.'
        )}
        size="xl"
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-700 text-foreground">{tp('adminFaqs.fields.category', 'Category')}</label>
              <select
                value={itemModal.form.category_id}
                onChange={(event) =>
                  setItemModal((current) => ({
                    ...current,
                    form: normalizeFaqItemInput({
                      ...current.form,
                      category_id: event.target.value,
                    }),
                  }))
                }
                className="input-base"
              >
                <option value="">{tp('adminFaqs.placeholders.selectCategory', 'Select a category')}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.translations.en.name || category.slug}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-700 text-foreground">{tp('adminFaqs.fields.slug', 'Slug')}</label>
              <input
                value={itemModal.form.slug}
                onChange={(event) =>
                  setItemModal((current) => ({
                    ...current,
                    form: normalizeFaqItemInput({
                      ...current.form,
                      slug: event.target.value,
                    }),
                  }))
                }
                className="input-base"
                placeholder={tp('adminFaqs.placeholders.itemSlug', 'how-do-i-get-started')}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-700 text-foreground">{tp('adminFaqs.fields.sortOrder', 'Sort order')}</label>
              <input
                type="number"
                value={itemModal.form.sort_order}
                onChange={(event) =>
                  setItemModal((current) => ({
                    ...current,
                    form: normalizeFaqItemInput({
                      ...current.form,
                      sort_order: Number(event.target.value),
                    }),
                  }))
                }
                className="input-base"
              />
            </div>
            <div className="flex flex-wrap items-center gap-5 pt-7">
              <label className="flex items-center gap-2 text-sm font-600 text-foreground">
                <input
                  type="checkbox"
                  checked={itemModal.form.is_active}
                  onChange={(event) =>
                    setItemModal((current) => ({
                      ...current,
                      form: normalizeFaqItemInput({
                        ...current.form,
                        is_active: event.target.checked,
                      }),
                    }))
                  }
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                {tp('adminFaqs.fields.published', 'Published')}
              </label>
              <label className="flex items-center gap-2 text-sm font-600 text-foreground">
                <input
                  type="checkbox"
                  checked={itemModal.form.is_featured}
                  onChange={(event) =>
                    setItemModal((current) => ({
                      ...current,
                      form: normalizeFaqItemInput({
                        ...current.form,
                        is_featured: event.target.checked,
                      }),
                    }))
                  }
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                {tp('adminFaqs.fields.featured', 'Featured')}
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 overflow-x-auto rounded-2xl bg-muted p-1">
              {FAQ_LANGUAGES.map((language) => (
                <button
                  key={language}
                  type="button"
                  onClick={() => setItemModal((current) => ({ ...current, activeLanguage: language }))}
                  className={`rounded-xl px-3 py-2 text-xs font-700 uppercase tracking-[0.12em] ${
                    itemModal.activeLanguage === language
                      ? 'bg-card text-foreground shadow-card-sm'
                      : 'text-muted-foreground'
                  }`}
                >
                  {languageLabels[language]}
                </button>
              ))}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-700 text-foreground">
                {tp('adminFaqs.translationQuestionLabel', '{{language}} question', {
                  language: languageLabels[itemModal.activeLanguage],
                })}
              </label>
              <input
                value={itemModal.form.translations[itemModal.activeLanguage].question}
                onChange={(event) =>
                  setItemTranslationField(itemModal.activeLanguage, 'question', event.target.value)
                }
                className="input-base"
                placeholder={tp('adminFaqs.placeholders.itemQuestion', 'Enter the question')}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-700 text-foreground">
                {tp('adminFaqs.translationAnswerLabel', '{{language}} answer', {
                  language: languageLabels[itemModal.activeLanguage],
                })}
              </label>
              <RichTextEditor
                value={itemModal.form.translations[itemModal.activeLanguage].answer_html}
                onChange={(nextValue) =>
                  setItemTranslationField(itemModal.activeLanguage, 'answer_html', nextValue)
                }
                placeholder={tp('adminFaqs.placeholders.itemAnswer', 'Write the FAQ answer...')}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-700 text-foreground">
                {tp('adminFaqs.translationKeywordsLabel', '{{language}} keywords', {
                  language: languageLabels[itemModal.activeLanguage],
                })}
              </label>
              <input
                value={keywordArrayToString(itemModal.form.translations[itemModal.activeLanguage].keywords)}
                onChange={(event) =>
                  setItemTranslationField(itemModal.activeLanguage, 'keywords', event.target.value)
                }
                className="input-base"
                placeholder={tp('adminFaqs.placeholders.itemKeywords', 'keyword one, keyword two')}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/25 p-4">
            <div className="flex items-center gap-2">
              <Eye size={15} className="text-accent" />
              <p className="text-sm font-700 text-foreground">{tp('adminFaqs.previewTitle', 'Preview')}</p>
            </div>
            <p className="mt-3 text-base font-700 text-foreground">
              {itemModal.form.translations[itemModal.activeLanguage].question || tp('adminFaqs.fallbacks.untitledQuestion', 'Untitled question')}
            </p>
            <div className="mt-3 rounded-2xl bg-card p-4">
              <CmsHtml
                html={itemModal.form.translations[itemModal.activeLanguage].answer_html}
                className="prose prose-slate max-w-none text-sm text-muted-foreground [&_a]:text-accent [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={() => setItemModal((current) => ({ ...current, open: false }))}>
              {tp('adminFaqs.actions.cancel', 'Cancel')}
            </button>
            <button type="button" className="btn-primary" onClick={() => void saveItem()} disabled={isSaving}>
              {isSaving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {itemModal.mode === 'edit'
                ? tp('adminFaqs.actions.saveItem', 'Save FAQ')
                : itemModal.mode === 'duplicate'
                  ? tp('adminFaqs.actions.createDuplicate', 'Create Duplicate')
                  : tp('adminFaqs.actions.createItem', 'Create FAQ')}
            </button>
          </div>
        </div>
      </Modal>

      <SupportConfirmationModal
        open={Boolean(deleteState)}
        title={deleteState?.title || ''}
        description={deleteState?.description || ''}
        confirmLabel={
          deleteState?.type === 'category'
            ? tp('adminFaqs.actions.deleteCategory', 'Delete Category')
            : tp('adminFaqs.actions.deleteItem', 'Delete FAQ')
        }
        cancelLabel={tp('adminFaqs.actions.cancel', 'Cancel')}
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleteState(null)}
        pending={isSaving}
      />
    </div>
  );
}
