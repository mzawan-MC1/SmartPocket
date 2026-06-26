'use client';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import AppLayout from '@/components/AppLayout';
import { Tag, Plus, Edit2, Trash2, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import SearchField from '@/components/ui/SearchField';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import { translateSystemCategoryName } from '@/lib/system-category-display';


interface Category {
  id: string;
  name: string;
  category_type: 'income' | 'expense' | 'transfer';
  color: string;
  icon: string;
  is_system: boolean;
}

interface CategoryFormData {
  name: string;
  category_type: 'income' | 'expense' | 'transfer';
  color: string;
}

const SYSTEM_CATEGORIES: Category[] = [
  { id: 'sys-1', name: 'Salary', category_type: 'income', color: '#059669', icon: 'Briefcase', is_system: true },
  { id: 'sys-2', name: 'Freelance', category_type: 'income', color: '#0ea5e9', icon: 'Laptop', is_system: true },
  { id: 'sys-3', name: 'Groceries & Household', category_type: 'expense', color: '#65a30d', icon: 'ShoppingCart', is_system: true },
  { id: 'sys-4', name: 'Dining Out', category_type: 'expense', color: '#f97316', icon: 'UtensilsCrossed', is_system: true },
  { id: 'sys-5', name: 'Housing', category_type: 'expense', color: '#7c3aed', icon: 'Home', is_system: true },
  { id: 'sys-6', name: 'Transport', category_type: 'expense', color: '#2563eb', icon: 'Car', is_system: true },
  { id: 'sys-7', name: 'Utilities', category_type: 'expense', color: '#8b5cf6', icon: 'Zap', is_system: true },
  { id: 'sys-8', name: 'Shopping', category_type: 'expense', color: '#d97706', icon: 'ShoppingBag', is_system: true },
  { id: 'sys-9', name: 'Healthcare', category_type: 'expense', color: '#ec4899', icon: 'Heart', is_system: true },
  { id: 'sys-10', name: 'Entertainment', category_type: 'expense', color: '#dc2626', icon: 'Tv', is_system: true },
  { id: 'sys-11', name: 'Travel', category_type: 'expense', color: '#0891b2', icon: 'Plane', is_system: true },
  { id: 'sys-12', name: 'Education', category_type: 'expense', color: '#16a34a', icon: 'BookOpen', is_system: true },
  { id: 'sys-13', name: 'Personal Care', category_type: 'expense', color: '#db2777', icon: 'Sparkles', is_system: true },
  { id: 'sys-14', name: 'Subscriptions', category_type: 'expense', color: '#7c3aed', icon: 'RefreshCw', is_system: true },
  { id: 'sys-15', name: 'Savings', category_type: 'expense', color: '#059669', icon: 'PiggyBank', is_system: true },
  { id: 'sys-16', name: 'Other Expense', category_type: 'expense', color: '#6b7280', icon: 'Tag', is_system: true },
  { id: 'sys-17', name: 'Other', category_type: 'expense', color: '#6b7280', icon: 'EllipsisHorizontal', is_system: true },
  { id: 'sys-18', name: 'Transfer', category_type: 'transfer', color: '#0ea5e9', icon: 'ArrowLeftRight', is_system: true },
];

const COLOR_OPTIONS = [
  '#059669', '#0ea5e9', '#f97316', '#7c3aed', '#2563eb', '#8b5cf6',
  '#d97706', '#ec4899', '#dc2626', '#0891b2', '#16a34a', '#6b7280',
];

export default function CategoriesPage() {
  const { t } = useTranslation('portal');
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const { user } = useAuth();

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CategoryFormData>({
    defaultValues: { category_type: 'expense', color: '#6b7280' },
  });

  const selectedColor = watch('color');

  useEffect(() => {
    loadCategories();
  }, [user]);

  const loadCategories = async () => {
    if (!user) {
      setCategories(SYSTEM_CATEGORIES);
      setIsLoading(false);
      return;
    }
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .or(`user_id.eq.${user.id},is_system.eq.true`)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setCategories(data || SYSTEM_CATEGORIES);
    } catch {
      setCategories(SYSTEM_CATEGORIES);
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: CategoryFormData) => {
    if (!user) return;
    setIsSaving(true);
    try {
      const supabase = createClient();
      if (editCategory) {
        const { error } = await supabase
          .from('categories')
          .update({ name: data.name, category_type: data.category_type, color: data.color })
          .eq('id', editCategory.id)
          .eq('user_id', user.id);
        if (error) throw error;
        toast.success(t('categories.updated'));
      } else {
        const { error } = await supabase.from('categories').insert({
          user_id: user.id,
          name: data.name,
          category_type: data.category_type,
          color: data.color,
          icon: 'Tag',
          is_system: false,
        });
        if (error) throw error;
        toast.success(t('categories.created'));
      }
      reset();
      setShowAddModal(false);
      setEditCategory(null);
      loadCategories();
    } catch (err: any) {
      toast.error(err?.message || t('categories.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (cat: Category) => {
    if (cat.is_system) { toast.error(t('categories.systemDeleteBlocked')); return; }
    if (!user) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.from('categories').delete().eq('id', cat.id).eq('user_id', user.id);
      if (error) throw error;
      toast.success(t('categories.deleted'));
      loadCategories();
    } catch (err: any) {
      toast.error(err?.message || t('categories.deleteFailed'));
    }
  };

  const handleEdit = (cat: Category) => {
    setEditCategory(cat);
    setValue('name', cat.name);
    setValue('category_type', cat.category_type);
    setValue('color', cat.color);
    setShowAddModal(true);
  };

  const filtered = categories.filter((c) => {
    const displayName = translateSystemCategoryName(c.name, t);
    const matchSearch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      displayName.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || c.category_type === filterType;
    return matchSearch && matchType;
  });

  const grouped = {
    income: filtered.filter((c) => c.category_type === 'income'),
    expense: filtered.filter((c) => c.category_type === 'expense'),
    transfer: filtered.filter((c) => c.category_type === 'transfer'),
  };

  return (
    <AppLayout activeRoute="/categories">
      <div className="page-section max-[480px]:gap-3">
        <PageHeader
          title={t('categories.title')}
          description={t('categories.description')}
          badge={<StatusBadge status="info" label={t('categories.badge')} />}
          compact
          className="max-[480px]:gap-2 [&_.page-subtitle]:max-[480px]:hidden"
          actionsClassName="w-full sm:w-auto"
          actions={
            <button onClick={() => { setEditCategory(null); reset(); setShowAddModal(true); }} className="btn-primary max-[480px]:w-full">
              <Plus size={16} />
              {t('categories.addCategory')}
            </button>
          }
        />

        {/* Filters */}
        <div className="card-elevated flex flex-col gap-3 p-4 max-[480px]:p-3 sm:flex-row">
          <SearchField
            placeholder={t('categories.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            wrapperClassName="flex-1"
            inputClassName="h-10"
          />
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {(['all', 'income', 'expense', 'transfer'] as const).map((filterValue) => (
              <button
                key={filterValue}
                onClick={() => setFilterType(filterValue)}
                className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-600 transition-all ${
                  filterType === filterValue ? 'bg-accent text-accent-foreground border-accent' : 'bg-card text-muted-foreground border-border hover:border-accent/50'
                }`}
              >
                {filterValue === 'all'
                  ? t('categories.filters.all')
                  : filterValue === 'income'
                    ? t('categories.filters.income')
                    : filterValue === 'expense'
                      ? t('categories.filters.expense')
                      : t('categories.filters.transfer')}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-accent" />
          </div>
        ) : (
          <div className="space-y-5 max-[480px]:space-y-4">
            {(['income', 'expense', 'transfer'] as const).map((type) => {
              const cats = grouped[type];
              if (cats.length === 0 && filterType !== 'all' && filterType !== type) return null;
              return (
                <div key={type}>
                  <h2 className="text-sm font-700 uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${type === 'income' ? 'bg-positive' : type === 'expense' ? 'bg-negative' : 'bg-info'}`} />
                    {t('categories.groupHeading', {
                      type:
                        type === 'income'
                          ? t('categories.filters.income')
                          : type === 'expense'
                            ? t('categories.filters.expense')
                            : t('categories.filters.transfer'),
                      count: cats.length,
                    })}
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {cats.map((cat) => (
                      <div key={cat.id} className="group card-elevated flex items-center gap-3 p-4 max-[480px]:p-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${cat.color}20` }}
                        >
                          <Tag size={18} style={{ color: cat.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-600 text-foreground truncate">
                            {translateSystemCategoryName(cat.name, t)}
                          </p>
                          {cat.is_system && (
                            <span className="text-[10px] text-muted-foreground">{t('categories.system')}</span>
                          )}
                        </div>
                        {!cat.is_system && (
                          <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                            <button
                              onClick={() => handleEdit(cat)}
                              className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center"
                              aria-label={t('categories.editCategory')}
                            >
                              <Edit2 size={13} className="text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => handleDelete(cat)}
                              className="w-7 h-7 rounded-lg hover:bg-negative-soft flex items-center justify-center"
                              aria-label={t('categories.deleteCategory')}
                            >
                              <Trash2 size={13} className="text-negative" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setEditCategory(null); reset(); }}
        title={editCategory ? t('categories.editCategory') : t('categories.addCategory')}
        size="sm"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <label htmlFor="cat-name" className="block text-sm font-600 text-foreground mb-1.5">
              {t('categories.form.name')} <span className="text-negative">*</span>
            </label>
            <input
              id="cat-name"
              type="text"
              className={`input-base ${errors.name ? 'input-error' : ''}`}
              placeholder={t('categories.form.namePlaceholder')}
              {...register('name', { required: t('categories.form.nameRequired') })}
            />
            {errors.name && <p className="mt-1.5 text-xs text-negative font-500">{errors.name.message}</p>}
          </div>

          <div>
            <label htmlFor="cat-type" className="block text-sm font-600 text-foreground mb-1.5">{t('categories.form.type')}</label>
            <select id="cat-type" className="input-base" {...register('category_type')}>
              <option value="expense">{t('categories.filters.expense')}</option>
              <option value="income">{t('categories.filters.income')}</option>
              <option value="transfer">{t('categories.filters.transfer')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">{t('categories.form.color')}</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setValue('color', color)}
                  className={`w-8 h-8 rounded-lg transition-all ${selectedColor === color ? 'ring-2 ring-offset-2 ring-accent scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: color }}
                  aria-label={t('categories.form.selectColor', { color })}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-border">
            <button type="button" onClick={() => { setShowAddModal(false); setEditCategory(null); reset(); }} className="btn-secondary">{t('categories.cancel')}</button>
            <button type="submit" disabled={isSaving} className="btn-primary">
              {isSaving ? <><Loader2 size={15} className="animate-spin" />{t('categories.saving')}</> : (editCategory ? t('categories.update') : t('categories.createCategory'))}
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
