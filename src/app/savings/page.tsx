'use client';
import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import SubscriptionFeatureGate from '@/components/subscription/SubscriptionFeatureGate';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import CurrencySelector from '@/components/CurrencySelector';
import Modal from '@/components/ui/Modal';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import {
  PiggyBank,
  Plus,
  Shield,
  Plane,
  Home,
  GraduationCap,
  Car,
  Target,
  CalendarDays,
  CalendarPlus2,
  Wallet,
  Sparkles,
  MoreHorizontal,
  Edit2,
  Trash2,
  PlusCircle,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { getAccounts, type FinancialAccount } from '@/lib/finance';
import { toast } from 'sonner';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { getCurrencyByCode } from '@/lib/reference-data/lookups';

type SavingsGoalCategoryDb =
  | 'emergency'
  | 'travel'
  | 'rent_or_bills'
  | 'education'
  | 'car_or_home'
  | 'other';

interface SavingsGoalRecord {
  id: string;
  user_id: string;
  name: string;
  category: SavingsGoalCategoryDb;
  currency: string;
  target_amount: number | string;
  current_saved: number | string;
  monthly_contribution: number | string;
  target_date: string | null;
  linked_account_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const CATEGORY_OPTIONS: ReadonlyArray<{
  id: SavingsGoalCategoryDb;
  label: string;
  defaultValue: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accent: string;
}> = [
  {
    id: 'emergency',
    label: 'Emergency fund',
    defaultValue: 'Emergency fund',
    description: 'Cover 3–6 months of essential expenses.',
    icon: Shield,
    accent: '#0ea5e9',
  },
  {
    id: 'travel',
    label: 'Travel',
    defaultValue: 'Travel',
    description: 'Flights, hotels, and experiences.',
    icon: Plane,
    accent: '#10b981',
  },
  {
    id: 'rent_or_bills',
    label: 'Rent or bills',
    defaultValue: 'Rent or bills',
    description: 'Set aside for housing and utilities.',
    icon: Home,
    accent: '#6366f1',
  },
  {
    id: 'education',
    label: 'Education',
    defaultValue: 'Education',
    description: 'Courses, books, or tuition.',
    icon: GraduationCap,
    accent: '#f59e0b',
  },
  {
    id: 'car_or_home',
    label: 'Car or home',
    defaultValue: 'Car or home',
    description: 'Down payments or large purchases.',
    icon: Car,
    accent: '#ec4899',
  },
  {
    id: 'other',
    label: 'Other goals',
    defaultValue: 'New savings goal',
    description: 'Anything else you are saving for.',
    icon: Target,
    accent: '#6b7280',
  },
] as const;

const CATEGORY_BY_ID = Object.fromEntries(
  CATEGORY_OPTIONS.map((c) => [c.id, c])
) as Record<SavingsGoalCategoryDb, (typeof CATEGORY_OPTIONS)[number]>;

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatDateShort(iso: string | null | undefined, locale: string) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return null;
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
    }).format(d);
  } catch {
    return null;
  }
}

function dateToInputValue(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function goalStatus(goal: SavingsGoalRecord): { key: 'not_started' | 'in_progress' | 'completed'; label: string; tone: 'info' | 'success' | 'missing' } {
  const saved = toNumber(goal.current_saved);
  const target = toNumber(goal.target_amount);
  if (target <= 0 || saved <= 0) return { key: 'not_started', label: 'Not started', tone: 'missing' };
  if (saved >= target) return { key: 'completed', label: 'Completed', tone: 'success' };
  return { key: 'in_progress', label: 'In progress', tone: 'info' };
}

function GoalCardHeader({
  goal,
  locale,
}: {
  goal: SavingsGoalRecord;
  locale: string;
}) {
  const meta = CATEGORY_BY_ID[goal.category] ?? CATEGORY_BY_ID.other;
  const Icon = meta.icon;
  const saved = toNumber(goal.current_saved);
  const target = toNumber(goal.target_amount);
  const remaining = Math.max(0, target - saved);
  const progress = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
  const monthly = toNumber(goal.monthly_contribution);
  const status = goalStatus(goal);

  return (
    <div className="flex flex-col gap-3 p-5 max-[480px]:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-border"
            style={{ backgroundColor: `${meta.accent}14`, color: meta.accent }}
          >
            <Icon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="truncate text-[15px] font-800 text-foreground">{goal.name}</h3>
              <StatusBadge status={status.tone} label={status.label} />
            </div>
            <p className="mt-0.5 line-clamp-1 text-xs font-600 text-muted-foreground">
              {meta.label}
              {goal.target_date ? (
                <span className="ml-1.5 inline-flex items-center gap-1">
                  <CalendarDays size={11} className="text-accent/80" />
                  {formatDateShort(goal.target_date, locale)}
                </span>
              ) : null}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10.5px] font-700 uppercase tracking-[0.12em] text-muted-foreground">
              Saved / Target
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <FormattedCurrencyAmount
                amount={saved}
                currencyCode={goal.currency}
                className="text-lg font-800 text-foreground"
              />
              <span className="text-xs font-600 text-muted-foreground">
                /{' '}
                <FormattedCurrencyAmount
                  amount={target}
                  currencyCode={goal.currency}
                  textOnly
                />
              </span>
            </div>
          </div>
          <div className="shrink-0 rounded-2xl border border-border bg-muted/30 px-2.5 py-1 text-[11px] font-800 text-foreground">
            {progress.toFixed(0)}%
          </div>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/50">
          <div
            className="absolute left-0 top-0 h-full rounded-full"
            style={{
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${meta.accent}dd 0%, ${meta.accent}99 100%)`,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border border-border bg-muted/20 p-2.5">
          <p className="text-[10.5px] font-700 uppercase tracking-wide text-muted-foreground">
            Remaining
          </p>
          <FormattedCurrencyAmount
            amount={remaining}
            currencyCode={goal.currency}
            className="mt-0.5 block text-[13.5px] font-800 text-foreground"
          />
        </div>
        <div className="rounded-2xl border border-border bg-muted/20 p-2.5">
          <p className="text-[10.5px] font-700 uppercase tracking-wide text-muted-foreground">
            Monthly
          </p>
          <FormattedCurrencyAmount
            amount={monthly}
            currencyCode={goal.currency}
            className="mt-0.5 block text-[13.5px] font-800 text-emerald-600"
          />
        </div>
      </div>
    </div>
  );
}

interface GoalFormState {
  id?: string;
  name: string;
  category: SavingsGoalCategoryDb;
  currency: string;
  targetAmount: string;
  currentSaved: string;
  monthlyContribution: string;
  targetDate: string;
  linkedAccountId: string | null;
  notes: string;
}

function buildDefaultForm(defaultCurrencyCode: string, copyFrom?: SavingsGoalRecord | null): GoalFormState {
  if (copyFrom) {
    return {
      id: copyFrom.id,
      name: copyFrom.name,
      category: copyFrom.category,
      currency: copyFrom.currency,
      targetAmount: String(toNumber(copyFrom.target_amount)),
      currentSaved: String(toNumber(copyFrom.current_saved)),
      monthlyContribution: String(toNumber(copyFrom.monthly_contribution)),
      targetDate: dateToInputValue(copyFrom.target_date),
      linkedAccountId: copyFrom.linked_account_id,
      notes: copyFrom.notes ?? '',
    };
  }
  return {
    name: '',
    category: 'emergency',
    currency: defaultCurrencyCode,
    targetAmount: '',
    currentSaved: '',
    monthlyContribution: '',
    targetDate: '',
    linkedAccountId: null,
    notes: '',
  };
}

export default function SavingsPage() {
  const { t, i18n } = useTranslation(['portal', 'common']);
  const { isRTL } = useLanguage();
  const locale = i18n.language ?? 'en';
  const { user } = useAuth();
  const { data: refData } = useClientReferenceData();
  const currencies = refData?.snapshot.currencies ?? [];

  const [goals, setGoals] = useState<SavingsGoalRecord[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editGoal, setEditGoal] = useState<SavingsGoalRecord | null>(null);
  const [form, setForm] = useState<GoalFormState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [contribGoal, setContribGoal] = useState<SavingsGoalRecord | null>(null);
  const [contribAmount, setContribAmount] = useState('');
  const [isContributing, setIsContributing] = useState(false);

  const [deleteGoal, setDeleteGoal] = useState<SavingsGoalRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionsOpenFor, setActionsOpenFor] = useState<{ id: string; rect: { top: number; right: number; bottom: number; left: number; width: number; height: number } } | null>(null);
  const actionsButtonRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!user) {
      setGoals([]);
      setAccounts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([loadGoalsInternal(user.id, { cancelled }), loadAccountsInternal({ cancelled })])
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function loadAccountsInternal(flag: { cancelled: boolean }) {
    try {
      const next = await getAccounts({ activeOnly: true });
      if (!flag.cancelled) setAccounts(next);
    } catch {
      if (!flag.cancelled) setAccounts([]);
    }
  }

  async function loadGoalsInternal(userId: string, flag: { cancelled: boolean }) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('savings_goals')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!flag.cancelled) setGoals((data as SavingsGoalRecord[]) ?? []);
    } catch (err: any) {
      if (!flag.cancelled) {
        setGoals([]);
        toast.error(err?.message ?? t('savings.loadFailed', { defaultValue: 'Could not load savings goals.' }));
      }
    }
  }

  async function reloadGoals() {
    if (!user) return;
    const flag = { cancelled: false };
    await loadGoalsInternal(user.id, flag);
  }

  const defaultCurrencyCode = useMemo(() => {
    if (accounts.length > 0 && accounts[0].currency) return accounts[0].currency;
    if (goals.length > 0) return goals[0].currency;
    return 'USD';
  }, [accounts, goals]);

  const realSavingsAccounts = useMemo(
    () => accounts.filter((a) => a.account_type === 'savings'),
    [accounts]
  );

  const totalSavedFromAccounts = realSavingsAccounts.reduce(
    (sum, a) => sum + Number(a.current_balance ?? 0),
    0
  );
  const totalSavedFromGoals = goals.reduce(
    (sum, g) => sum + toNumber(g.current_saved),
    0
  );

  const totalSaved = totalSavedFromAccounts + totalSavedFromGoals;
  const activeGoalsCount = goals.filter(
    (g) => {
      const s = goalStatus(g).key;
      return s === 'in_progress' || s === 'not_started';
    }
  ).length;
  const monthlyTarget = goals.reduce(
    (sum, g) => sum + toNumber(g.monthly_contribution),
    0
  );
  const nextTargetDate = useMemo(() => {
    const candidates = goals
      .filter((g) => {
        const s = goalStatus(g).key;
        return (s === 'in_progress' || s === 'not_started') && !!g.target_date;
      })
      .map((g) => ({ goal: g, time: new Date(g.target_date as string).getTime() }))
      .filter((c) => Number.isFinite(c.time))
      .sort((a, b) => a.time - b.time);
    return candidates[0]?.goal ?? null;
  }, [goals]);

  function openNewGoal(category?: SavingsGoalCategoryDb) {
    if (!user) return;
    const base = buildDefaultForm(defaultCurrencyCode);
    if (category) {
      const meta = CATEGORY_BY_ID[category];
      base.category = category;
      base.name = meta.defaultValue;
    }
    setEditGoal(null);
    setForm(base);
    setShowForm(true);
  }

  function openEditGoal(goal: SavingsGoalRecord) {
    setEditGoal(goal);
    setForm(buildDefaultForm(defaultCurrencyCode, goal));
    setShowForm(true);
    setActionsOpenFor(null);
  }

  function openDelete(goal: SavingsGoalRecord) {
    setDeleteGoal(goal);
    setActionsOpenFor(null);
  }

  function openContribution(goal: SavingsGoalRecord) {
    setContribGoal(goal);
    setContribAmount('');
    setActionsOpenFor(null);
  }

  async function submitForm() {
    if (!form || !user) return;
    setIsSaving(true);
    try {
      const targetAmount = toNumber(form.targetAmount);
      const currentSaved = toNumber(form.currentSaved);
      if (!form.name.trim()) {
        throw new Error(t('savings.form.nameRequired', { defaultValue: 'Goal name is required.' }));
      }
      if (targetAmount <= 0) {
        throw new Error(t('savings.form.targetRequired', { defaultValue: 'Target amount must be greater than 0.' }));
      }
      if (currentSaved > targetAmount) {
        throw new Error(t('savings.form.savedTooHigh', { defaultValue: 'Saved amount cannot be greater than target.' }));
      }
      const supabase = createClient();
      const payload = {
        user_id: user.id,
        name: form.name.trim(),
        category: form.category,
        currency: form.currency,
        target_amount: targetAmount,
        current_saved: currentSaved,
        monthly_contribution: toNumber(form.monthlyContribution),
        target_date: form.targetDate || null,
        linked_account_id: form.linkedAccountId || null,
        notes: form.notes.trim() || null,
      };
      if (editGoal) {
        const { error } = await supabase
          .from('savings_goals')
          .update(payload)
          .eq('id', editGoal.id)
          .eq('user_id', user.id);
        if (error) throw error;
        toast.success(t('savings.updated', { defaultValue: 'Savings goal updated.' }));
      } else {
        const { error } = await supabase.from('savings_goals').insert(payload);
        if (error) throw error;
        toast.success(t('savings.created', { defaultValue: 'Savings goal created.' }));
      }
      await reloadGoals();
      setShowForm(false);
      setEditGoal(null);
      setForm(null);
    } catch (err: any) {
      toast.error(err?.message ?? t('savings.saveFailed', { defaultValue: 'Could not save goal.' }));
    } finally {
      setIsSaving(false);
    }
  }

  async function submitContribution() {
    if (!contribGoal || !user) return;
    setIsContributing(true);
    try {
      const amount = toNumber(contribAmount);
      if (amount <= 0) {
        throw new Error(t('savings.contrib.positive', { defaultValue: 'Enter an amount greater than 0.' }));
      }
      const current = toNumber(contribGoal.current_saved);
      const next = current + amount;
      const supabase = createClient();
      const { error } = await supabase
        .from('savings_goals')
        .update({ current_saved: next })
        .eq('id', contribGoal.id)
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success(t('savings.contrib.added', { defaultValue: 'Contribution added.' }));
      setContribGoal(null);
      setContribAmount('');
      await reloadGoals();
    } catch (err: any) {
      toast.error(err?.message ?? t('savings.contrib.failed', { defaultValue: 'Could not add contribution.' }));
    } finally {
      setIsContributing(false);
    }
  }

  async function confirmDelete() {
    if (!deleteGoal || !user) return;
    setIsDeleting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('savings_goals')
        .delete()
        .eq('id', deleteGoal.id)
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success(t('savings.deleted', { defaultValue: 'Savings goal deleted.' }));
      setDeleteGoal(null);
      await reloadGoals();
    } catch (err: any) {
      toast.error(err?.message ?? t('savings.deleteFailed', { defaultValue: 'Could not delete goal.' }));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AppLayout activeRoute="/savings" hideMobileFooter>
      <SubscriptionFeatureGate feature="savings">
        <div className="page-section page-shell-readable max-w-[1180px]">
        <PageHeader
          title={t('savings.title', { defaultValue: 'Savings' })}
          description={t(
            'savings.description',
            { defaultValue: 'Track money you are setting aside for goals, emergencies, and future plans.' }
          )}
          badge={<StatusBadge status="info" label={t('savings.badge', { defaultValue: 'Your goals' })} />}
          compact
          actions={
            <button
              type="button"
              onClick={() => openNewGoal()}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              <Plus size={15} />
              {t('savings.newGoal', { defaultValue: 'New savings goal' })}
            </button>
          }
        />

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2 md:gap-3.5 lg:grid-cols-4">
          <div className="rounded-[22px] border border-border bg-gradient-to-br from-accent/8 via-card to-card card-elevated p-4">
            <div className="flex items-center gap-2 text-[10.5px] font-700 uppercase tracking-[0.12em] text-accent">
              <PiggyBank size={13} />
              {t('savings.summary.totalSaved', { defaultValue: 'Total saved' })}
            </div>
            <FormattedCurrencyAmount
              amount={totalSaved}
              currencyCode={defaultCurrencyCode}
              className="mt-1.5 block text-[18px] font-800 text-foreground"
            />
          </div>
          <div className="rounded-[22px] border border-border bg-gradient-to-br from-emerald-500/6 via-card to-card card-elevated p-4">
            <div className="flex items-center gap-2 text-[10.5px] font-700 uppercase tracking-[0.12em] text-emerald-600">
              <Target size={13} />
              {t('savings.summary.activeGoals', { defaultValue: 'Active goals' })}
            </div>
            <p className="mt-1.5 text-[18px] font-800 text-foreground">
              {activeGoalsCount}
            </p>
          </div>
          <div className="rounded-[22px] border border-border bg-gradient-to-br from-indigo-500/6 via-card to-card card-elevated p-4">
            <div className="flex items-center gap-2 text-[10.5px] font-700 uppercase tracking-[0.12em] text-indigo-600">
              <CalendarPlus2 size={13} />
              {t('savings.summary.monthlyTarget', { defaultValue: 'Monthly target' })}
            </div>
            <FormattedCurrencyAmount
              amount={monthlyTarget}
              currencyCode={defaultCurrencyCode}
              className="mt-1.5 block text-[18px] font-800 text-foreground"
            />
          </div>
          <div className="rounded-[22px] border border-border bg-gradient-to-br from-amber-500/6 via-card to-card card-elevated p-4">
            <div className="flex items-center gap-2 text-[10.5px] font-700 uppercase tracking-[0.12em] text-amber-600">
              <CalendarDays size={13} />
              {t('savings.summary.nextTargetDate', { defaultValue: 'Next target date' })}
            </div>
            {nextTargetDate ? (
              <div className="mt-1.5 space-y-0.5">
                <p className="text-[18px] font-800 text-foreground">
                  {formatDateShort(nextTargetDate.target_date, locale)}
                </p>
                <p className="truncate text-[11px] font-600 text-muted-foreground">
                  {nextTargetDate.name}
                </p>
              </div>
            ) : (
              <p className="mt-1.5 text-[14px] font-700 text-muted-foreground">
                —
              </p>
            )}
          </div>
        </div>

        {realSavingsAccounts.length > 0 && (
          <div className="mt-5 rounded-[24px] border border-border bg-card card-elevated">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5 max-[480px]:px-4 max-[480px]:py-3">
              <div>
                <p className="text-[11px] font-700 uppercase tracking-[0.12em] text-accent">
                  {t('savings.accounts.title', { defaultValue: 'Existing savings accounts' })}
                </p>
                <p className="mt-0.5 text-xs font-600 text-muted-foreground">
                  {t('savings.accounts.subtitle', {
                    defaultValue: 'Included in Total saved alongside your goals.',
                  })}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-700 text-emerald-700">
                <Sparkles size={12} /> Real data
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 p-5 sm:grid-cols-2 max-[480px]:p-4">
              {realSavingsAccounts.map((account) => {
                const currencyMeta = getCurrencyByCode(currencies, account.currency);
                return (
                  <div key={account.id} className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 p-3.5">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-accent">
                      <PiggyBank size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[14px] font-800 text-foreground">{account.name}</p>
                        {currencyMeta ? (
                          <span className="rounded-full border border-border bg-card px-1.5 py-0.5 text-[10.5px] font-700 text-muted-foreground">
                            {currencyMeta.code}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{account.account_number_masked || account.id.slice(0, 8)}</p>
                      <FormattedCurrencyAmount
                        amount={Number(account.current_balance ?? 0)}
                        currencyCode={account.currency}
                        className="mt-1 block text-[15px] font-800 text-foreground"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-5 rounded-[24px] border border-border bg-card card-elevated">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5 max-[480px]:px-4 max-[480px]:py-3">
            <div>
              <p className="text-[11px] font-700 uppercase tracking-[0.12em] text-accent">
                {t('savings.goals.title', { defaultValue: 'Savings goals' })}
              </p>
              <p className="mt-0.5 text-xs font-600 text-muted-foreground">
                {t('savings.goals.subtitle', {
                  defaultValue: 'Create a goal, track what you save, and add contributions as you go.',
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openNewGoal()}
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
            >
              <Plus size={13} />
              {t('savings.newGoal', { defaultValue: 'New savings goal' })}
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 max-[480px]:p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-52 w-full animate-pulse rounded-[22px] bg-muted/40" />
              ))}
            </div>
          ) : goals.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Wallet}
                variant="default"
                tone="accent"
                title={t('savings.empty.title', { defaultValue: 'No savings goals yet' })}
                description={t('savings.empty.description', {
                  defaultValue:
                    'Start with an emergency fund, a trip, or any personal goal you want to track over time.',
                })}
                action={{
                  label: t('savings.empty.action', { defaultValue: 'Create your first goal' }),
                  onClick: () => openNewGoal('emergency'),
                }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 max-[480px]:p-4">
              {goals.map((goal) => {
                const actionsOpen = actionsOpenFor?.id === goal.id;
                return (
                  <div key={goal.id} className="flex flex-col overflow-hidden rounded-[22px] border border-border bg-gradient-to-br from-card via-card to-muted/20">
                    <GoalCardHeader goal={goal} locale={locale} />
                    <div className="flex items-center justify-between border-t border-border/70 bg-muted/15 px-4 py-2.5 max-[480px]:px-3">
                      <button
                        type="button"
                        onClick={() => openContribution(goal)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-[11.5px] font-800 text-emerald-700 transition hover:bg-emerald-500/15"
                      >
                        <PlusCircle size={13} />
                        {t('savings.goals.addContribution', { defaultValue: 'Add contribution' })}
                      </button>
                      <div>
                        <button
                          type="button"
                          ref={(node) => { actionsButtonRefs.current[goal.id] = node; }}
                          onClick={(event) => {
                            if (actionsOpen) {
                              setActionsOpenFor(null);
                              return;
                            }
                            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                            setActionsOpenFor({ id: goal.id, rect: rect.toJSON() });
                          }}
                          className="relative z-40 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
                          aria-haspopup="menu"
                          aria-expanded={actionsOpen}
                          aria-label={t('savings.goals.actions', { defaultValue: 'Goal actions' })}
                        >
                          <MoreHorizontal size={15} />
                        </button>
                        {actionsOpen && actionsOpenFor && (
                          <>
                            <div
                              className="fixed inset-0 z-[70]"
                              onClick={() => setActionsOpenFor(null)}
                              onContextMenu={(e) => { e.stopPropagation(); setActionsOpenFor(null); }}
                            />
                            <div
                              className={`fixed z-[71] w-44 overflow-hidden rounded-2xl border border-border bg-card shadow-card-lg ${
                                isRTL ? 'end-2' : 'start-2'
                              }`}
                              style={{
                                top: `${actionsOpenFor.rect.bottom + 6}px`,
                                ...(isRTL
                                  ? { right: `${Math.max(8, actionsOpenFor.rect.right - actionsOpenFor.rect.width + 8)}px`, left: 'auto' }
                                  : { left: `${Math.max(8, actionsOpenFor.rect.right - 176)}px`, right: 'auto' }),
                                maxWidth: `calc(100vw - 16px)`,
                              }}
                              role="menu"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => { setActionsOpenFor(null); openEditGoal(goal); }}
                                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[12.5px] font-700 text-foreground transition hover:bg-muted/40"
                              >
                                <Edit2 size={14} />
                                {t('savings.goals.edit', { defaultValue: 'Edit' })}
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => { setActionsOpenFor(null); openDelete(goal); }}
                                className="flex w-full items-center gap-2 border-t border-border/60 px-3.5 py-2.5 text-left text-[12.5px] font-700 text-rose-600 transition hover:bg-rose-500/10"
                              >
                                <Trash2 size={14} />
                                {t('savings.goals.delete', { defaultValue: 'Delete' })}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showForm && form && (
        <Modal
          isOpen
          size="lg"
          onClose={() => {
            if (!isSaving) {
              setShowForm(false);
              setEditGoal(null);
              setForm(null);
            }
          }}
          title={editGoal
            ? t('savings.form.editTitle', { defaultValue: 'Edit savings goal' })
            : t('savings.form.title', { defaultValue: 'New savings goal' })}
          description={t('savings.form.description', {
            defaultValue: 'Set a target, what you have already saved, and an optional monthly contribution.',
          })}
          stickyFooter
          closeOnBackdrop={!isSaving}
          closeOnEscape={!isSaving}
          footer={
            <div className={`flex gap-3 p-4 max-[480px]:flex-col-reverse ${isRTL ? 'sm:flex-row-reverse' : 'sm:justify-end'}`}>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditGoal(null);
                  setForm(null);
                }}
                disabled={isSaving}
                className="btn-secondary max-[480px]:w-full"
              >
                {t('common.actions.cancel', { defaultValue: 'Cancel' })}
              </button>
              <button
                type="button"
                onClick={() => void submitForm()}
                disabled={isSaving}
                className="btn-primary inline-flex items-center gap-1.5 max-[480px]:w-full"
              >
                {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                {editGoal
                  ? t('savings.form.update', { defaultValue: 'Update goal' })
                  : t('savings.form.create', { defaultValue: 'Create goal' })}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-700 uppercase tracking-wide text-muted-foreground">
                {t('savings.form.goalName', { defaultValue: 'Goal name' })}
              </label>
              <input
                type="text"
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('savings.form.goalNamePlaceholder', { defaultValue: 'Emergency fund, Bali trip…' })}
                className="input-base w-full"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-xs font-700 uppercase tracking-wide text-muted-foreground">
                  {t('savings.form.category', { defaultValue: 'Category' })}
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as SavingsGoalCategoryDb })}
                  className="input-base w-full"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <CurrencySelector
                  label={t('savings.form.currency', { defaultValue: 'Currency' })}
                  value={form.currency}
                  onChange={(code) => setForm({ ...form, currency: code })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-xs font-700 uppercase tracking-wide text-muted-foreground">
                  {t('savings.form.targetAmount', { defaultValue: 'Target amount' })}
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.targetAmount}
                  onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
                  placeholder="10000"
                  className="input-base w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-700 uppercase tracking-wide text-muted-foreground">
                  {t('savings.form.currentSaved', { defaultValue: 'Current saved' })}
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.currentSaved}
                  onChange={(e) => setForm({ ...form, currentSaved: e.target.value })}
                  placeholder="0"
                  className="input-base w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-xs font-700 uppercase tracking-wide text-muted-foreground">
                  {t('savings.form.monthlyContribution', { defaultValue: 'Monthly contribution' })}
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.monthlyContribution}
                  onChange={(e) => setForm({ ...form, monthlyContribution: e.target.value })}
                  placeholder="300"
                  className="input-base w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-700 uppercase tracking-wide text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays size={12} className="text-accent/80" />
                    {t('savings.form.targetDate', { defaultValue: 'Target date (optional)' })}
                  </span>
                </label>
                <input
                  type="date"
                  value={form.targetDate}
                  onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
                  className="input-base w-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-700 uppercase tracking-wide text-muted-foreground">
                {t('savings.form.linkedAccount', { defaultValue: 'Linked account (optional)' })}
              </label>
              <select
                value={form.linkedAccountId ?? ''}
                onChange={(e) => setForm({ ...form, linkedAccountId: e.target.value || null })}
                className="input-base w-full"
              >
                <option value="">{t('savings.form.noLinkedAccount', { defaultValue: 'Not linked' })}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-700 uppercase tracking-wide text-muted-foreground">
                {t('savings.form.notes', { defaultValue: 'Notes (optional)' })}
              </label>
              <textarea
                maxLength={1000}
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder={t('savings.form.notesPlaceholder', {
                  defaultValue: 'Why this goal matters, or a quick reminder to yourself.',
                })}
                className="input-base w-full resize-y"
              />
            </div>
          </div>
        </Modal>
      )}

      {contribGoal && (
        <Modal
          isOpen
          size="sm"
          onClose={() => {
            if (!isContributing) {
              setContribGoal(null);
              setContribAmount('');
            }
          }}
          title={t('savings.contrib.title', { defaultValue: 'Add contribution' })}
          description={`${contribGoal.name} · ${CATEGORY_BY_ID[contribGoal.category].label}`}
          stickyFooter
          closeOnBackdrop={!isContributing}
          closeOnEscape={!isContributing}
          footer={
            <div className={`flex gap-3 p-4 max-[480px]:flex-col-reverse ${isRTL ? 'sm:flex-row-reverse' : 'sm:justify-end'}`}>
              <button
                type="button"
                onClick={() => {
                  setContribGoal(null);
                  setContribAmount('');
                }}
                disabled={isContributing}
                className="btn-secondary max-[480px]:w-full"
              >
                {t('common.actions.cancel', { defaultValue: 'Cancel' })}
              </button>
              <button
                type="button"
                onClick={() => void submitContribution()}
                disabled={isContributing}
                className="btn-primary inline-flex items-center gap-1.5 max-[480px]:w-full"
              >
                {isContributing ? <Loader2 size={15} className="animate-spin" /> : <PlusCircle size={15} />}
                {t('savings.contrib.add', { defaultValue: 'Add' })}
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/20 p-3.5 text-xs">
              <span className="font-700 uppercase tracking-wide text-muted-foreground">
                {t('savings.contrib.currentSaved', { defaultValue: 'Current saved' })}
              </span>
              <FormattedCurrencyAmount
                amount={toNumber(contribGoal.current_saved)}
                currencyCode={contribGoal.currency}
                className="text-[14px] font-800 text-foreground"
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-700 uppercase tracking-wide text-muted-foreground">
                <PlusCircle size={12} className="text-emerald-600" />
                {t('savings.contrib.amount', { defaultValue: 'Contribution amount' })}
              </label>
              <input
                autoFocus
                type="number"
                min={0}
                step="any"
                value={contribAmount}
                onChange={(e) => setContribAmount(e.target.value)}
                placeholder="100"
                className="input-base w-full"
              />
              {toNumber(contribAmount) > 0 ? (
                <div className="flex items-center justify-between rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
                  <span className="font-700 uppercase tracking-wide text-emerald-700">
                    {t('savings.contrib.afterAdd', { defaultValue: 'After add' })}
                  </span>
                  <FormattedCurrencyAmount
                    amount={toNumber(contribGoal.current_saved) + toNumber(contribAmount)}
                    currencyCode={contribGoal.currency}
                    className="text-[14px] font-800 text-emerald-700"
                  />
                </div>
              ) : null}
            </div>
          </div>
        </Modal>
      )}

      <ConfirmationModal
        open={!!deleteGoal}
        tone="danger"
        title={t('savings.deleteConfirm.title', { defaultValue: 'Delete savings goal?' })}
        description={t('savings.deleteConfirm.description', {
          defaultValue: 'This action removes "{{name}}" and cannot be undone.',
        })}
        confirmLabel={t('savings.deleteConfirm.confirm', { defaultValue: 'Delete goal' })}
        cancelLabel={t('common.actions.cancel', { defaultValue: 'Cancel' })}
        pending={isDeleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => {
          if (!isDeleting) setDeleteGoal(null);
        }}
      />
      </SubscriptionFeatureGate>
    </AppLayout>
  );
}
