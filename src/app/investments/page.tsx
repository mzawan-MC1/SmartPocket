'use client';
import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import CurrencySelector from '@/components/CurrencySelector';
import Modal from '@/components/ui/Modal';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import {
  TrendingUp,
  TrendingDown,
  Plus,
  LineChart,
  Briefcase,
  Coins,
  Gem,
  Layers,
  MoreHorizontal,
  AlertCircle,
  Sparkles,
  Edit2,
  Trash2,
  Loader2,
  CalendarDays,
  DollarSign,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { getAccounts, type FinancialAccount } from '@/lib/finance';
import { toast } from 'sonner';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { getCurrencyByCode } from '@/lib/reference-data/lookups';

type InvestmentAssetTypeDb =
  | 'stocks'
  | 'crypto'
  | 'property'
  | 'gold_commodities'
  | 'funds'
  | 'other';

interface ManualInvestmentRecord {
  id: string;
  user_id: string;
  name: string;
  asset_type: InvestmentAssetTypeDb;
  currency: string;
  amount_invested: number | string;
  current_value: number | string;
  purchase_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const CATEGORY_OPTIONS: ReadonlyArray<{
  id: InvestmentAssetTypeDb;
  label: string;
  defaultName: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accent: string;
}> = [
  {
    id: 'stocks',
    label: 'Stocks',
    defaultName: 'Stocks / Equities',
    description: 'Company shares and ETFs you hold.',
    icon: LineChart,
    accent: '#2563eb',
  },
  {
    id: 'crypto',
    label: 'Crypto',
    defaultName: 'Crypto',
    description: 'Coins, tokens, and wrapped assets.',
    icon: Coins,
    accent: '#f59e0b',
  },
  {
    id: 'property',
    label: 'Property',
    defaultName: 'Real estate',
    description: 'Houses, apartments, REITs, or land.',
    icon: Briefcase,
    accent: '#10b981',
  },
  {
    id: 'gold_commodities',
    label: 'Gold / commodities',
    defaultName: 'Commodities',
    description: 'Precious metals, raw materials.',
    icon: Gem,
    accent: '#ca8a04',
  },
  {
    id: 'funds',
    label: 'Funds',
    defaultName: 'Investment fund',
    description: 'Mutual funds, index funds, pension pots.',
    icon: Layers,
    accent: '#6366f1',
  },
  {
    id: 'other',
    label: 'Other investments',
    defaultName: 'Other investment',
    description: 'Anything else you want to track.',
    icon: MoreHorizontal,
    accent: '#6b7280',
  },
] as const;

const CATEGORY_BY_ID = Object.fromEntries(
  CATEGORY_OPTIONS.map((c) => [c.id, c])
) as Record<InvestmentAssetTypeDb, (typeof CATEGORY_OPTIONS)[number]>;

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
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

interface InvestmentFormState {
  id?: string;
  name: string;
  assetType: InvestmentAssetTypeDb;
  currency: string;
  amountInvested: string;
  currentValue: string;
  purchaseDate: string;
  notes: string;
}

function buildInvestmentForm(
  defaultCurrencyCode: string,
  copyFrom?: ManualInvestmentRecord | null
): InvestmentFormState {
  if (copyFrom) {
    return {
      id: copyFrom.id,
      name: copyFrom.name,
      assetType: copyFrom.asset_type,
      currency: copyFrom.currency,
      amountInvested: String(toNumber(copyFrom.amount_invested)),
      currentValue: String(toNumber(copyFrom.current_value)),
      purchaseDate: dateToInputValue(copyFrom.purchase_date),
      notes: copyFrom.notes ?? '',
    };
  }
  return {
    name: '',
    assetType: 'stocks',
    currency: defaultCurrencyCode,
    amountInvested: '',
    currentValue: '',
    purchaseDate: '',
    notes: '',
  };
}

export default function InvestmentsPage() {
  const { t, i18n } = useTranslation(['portal', 'common']);
  const { isRTL } = useLanguage();
  const locale = i18n.language ?? 'en';
  const { user } = useAuth();
  const { data: refData } = useClientReferenceData();
  const currencies = refData?.snapshot.currencies ?? [];

  const [investments, setInvestments] = useState<ManualInvestmentRecord[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editInvestment, setEditInvestment] = useState<ManualInvestmentRecord | null>(null);
  const [form, setForm] = useState<InvestmentFormState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [deleteInv, setDeleteInv] = useState<ManualInvestmentRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionsOpenFor, setActionsOpenFor] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setInvestments([]);
      setAccounts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([loadInvestmentsInternal(user.id, { cancelled }), loadAccountsInternal({ cancelled })])
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

  async function loadInvestmentsInternal(userId: string, flag: { cancelled: boolean }) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('manual_investments')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!flag.cancelled) setInvestments((data as ManualInvestmentRecord[]) ?? []);
    } catch (err: any) {
      if (!flag.cancelled) {
        setInvestments([]);
        toast.error(err?.message ?? t('investments.loadFailed', { defaultValue: 'Could not load investments.' }));
      }
    }
  }

  async function reload() {
    if (!user) return;
    const flag = { cancelled: false };
    await loadInvestmentsInternal(user.id, flag);
  }

  const defaultCurrencyCode = useMemo(() => {
    if (investments.length > 0) return investments[0].currency;
    if (accounts.length > 0 && accounts[0].currency) return accounts[0].currency;
    return 'USD';
  }, [investments, accounts]);

  const realInvestmentAccounts = useMemo(
    () => accounts.filter((a) => a.account_type === 'investment'),
    [accounts]
  );

  const totalInvestedAccounts = realInvestmentAccounts.reduce(
    (s, a) => s + Number(a.opening_balance ?? a.current_balance ?? 0),
    0
  );
  const currentValueAccounts = realInvestmentAccounts.reduce(
    (s, a) => s + Number(a.current_balance ?? a.opening_balance ?? 0),
    0
  );
  const totalInvestedManual = investments.reduce((s, r) => s + toNumber(r.amount_invested), 0);
  const currentValueManual = investments.reduce((s, r) => s + toNumber(r.current_value), 0);

  const totalInvested = totalInvestedAccounts + totalInvestedManual;
  const currentValue = currentValueAccounts + currentValueManual;
  const gainLoss = currentValue - totalInvested;
  const gainLossPct = totalInvested > 0 ? (gainLoss / totalInvested) * 100 : 0;
  const gainIsPositive = gainLoss >= 0;
  const usedCategoryTypes = new Set(investments.map((r) => r.asset_type));
  realInvestmentAccounts.forEach(() => {
    // include_accounts_as_one_asset_presence
  });
  const assetTypesUsed = Math.min(6, usedCategoryTypes.size + (realInvestmentAccounts.length > 0 ? 1 : 0));

  function openNew(assetType?: InvestmentAssetTypeDb) {
    if (!user) return;
    const base = buildInvestmentForm(defaultCurrencyCode);
    if (assetType) {
      base.assetType = assetType;
      base.name = CATEGORY_BY_ID[assetType].defaultName;
    }
    setEditInvestment(null);
    setForm(base);
    setShowForm(true);
  }

  function openEdit(r: ManualInvestmentRecord) {
    setEditInvestment(r);
    setForm(buildInvestmentForm(defaultCurrencyCode, r));
    setShowForm(true);
    setActionsOpenFor(null);
  }

  function openDelete(r: ManualInvestmentRecord) {
    setDeleteInv(r);
    setActionsOpenFor(null);
  }

  async function submitForm() {
    if (!form || !user) return;
    setIsSaving(true);
    try {
      const invested = toNumber(form.amountInvested);
      const current = toNumber(form.currentValue);
      if (!form.name.trim()) {
        throw new Error(t('investments.form.nameRequired', { defaultValue: 'Investment name is required.' }));
      }
      const supabase = createClient();
      const payload = {
        user_id: user.id,
        name: form.name.trim(),
        asset_type: form.assetType,
        currency: form.currency,
        amount_invested: invested,
        current_value: current,
        purchase_date: form.purchaseDate || null,
        notes: form.notes.trim() || null,
      };
      if (editInvestment) {
        const { error } = await supabase
          .from('manual_investments')
          .update(payload)
          .eq('id', editInvestment.id)
          .eq('user_id', user.id);
        if (error) throw error;
        toast.success(t('investments.updated', { defaultValue: 'Investment updated.' }));
      } else {
        const { error } = await supabase.from('manual_investments').insert(payload);
        if (error) throw error;
        toast.success(t('investments.created', { defaultValue: 'Investment added.' }));
      }
      await reload();
      setShowForm(false);
      setEditInvestment(null);
      setForm(null);
    } catch (err: any) {
      toast.error(err?.message ?? t('investments.saveFailed', { defaultValue: 'Could not save investment.' }));
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteInv || !user) return;
    setIsDeleting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('manual_investments')
        .delete()
        .eq('id', deleteInv.id)
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success(t('investments.deleted', { defaultValue: 'Investment deleted.' }));
      setDeleteInv(null);
      await reload();
    } catch (err: any) {
      toast.error(err?.message ?? t('investments.deleteFailed', { defaultValue: 'Could not delete investment.' }));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AppLayout activeRoute="/investments" hideMobileFooter>
      <div className="page-section page-shell-readable max-w-[1180px]">
        <PageHeader
          title={t('investments.title', { defaultValue: 'Investments' })}
          description={t('investments.description', {
            defaultValue:
              'Track what you invested, current value, and overall growth in one place.',
          })}
          badge={<StatusBadge status="info" label={t('investments.badge', { defaultValue: 'Your holdings' })} />}
          compact
          actions={
            <button
              type="button"
              onClick={() => openNew()}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              <Plus size={15} />
              {t('investments.newInvestment', { defaultValue: 'Add investment' })}
            </button>
          }
        />

        <div className="mt-3 inline-flex w-full items-start gap-2 rounded-[22px] border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
            <AlertCircle size={18} />
          </div>
          <p className="text-[12.5px] leading-relaxed font-600 text-amber-900">
            {t('investments.disclaimer', {
              defaultValue:
                'Smart Pocket helps you track investments. It does not provide financial advice.',
            })}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:gap-3.5 lg:grid-cols-4">
          <div className="rounded-[22px] border border-border bg-gradient-to-br from-violet-500/6 via-card to-card card-elevated p-4">
            <div className="flex items-center gap-2 text-[10.5px] font-700 uppercase tracking-[0.12em] text-violet-600">
              <Briefcase size={13} />
              {t('investments.summary.totalInvested', { defaultValue: 'Total invested' })}
            </div>
            <FormattedCurrencyAmount
              amount={totalInvested}
              currencyCode={defaultCurrencyCode}
              className="mt-1.5 block text-[18px] font-800 text-foreground"
            />
          </div>
          <div className="rounded-[22px] border border-border bg-gradient-to-br from-sky-500/6 via-card to-card card-elevated p-4">
            <div className="flex items-center gap-2 text-[10.5px] font-700 uppercase tracking-[0.12em] text-sky-600">
              <DollarSign size={13} />
              {t('investments.summary.currentValue', { defaultValue: 'Current value' })}
            </div>
            <FormattedCurrencyAmount
              amount={currentValue}
              currencyCode={defaultCurrencyCode}
              className="mt-1.5 block text-[18px] font-800 text-foreground"
            />
          </div>
          <div className="rounded-[22px] border border-border bg-gradient-to-br via-card to-card card-elevated p-4"
            style={{ background: gainIsPositive
              ? 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(255,255,255,0) 55%)'
              : 'linear-gradient(135deg, rgba(244,63,94,0.08), rgba(255,255,255,0) 55%)' }}
          >
            <div className={`flex items-center gap-2 text-[10.5px] font-700 uppercase tracking-[0.12em] ${gainIsPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
              {gainIsPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {t('investments.summary.gainLoss', { defaultValue: 'Gain / loss' })}
            </div>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-1.5">
              <FormattedCurrencyAmount
                amount={Math.abs(gainLoss)}
                currencyCode={defaultCurrencyCode}
                className={`text-[18px] font-800 ${gainIsPositive ? 'text-emerald-600' : 'text-rose-600'}`}
              />
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-800 ${
                gainIsPositive
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700'
                  : 'border-rose-500/20 bg-rose-500/10 text-rose-700'
              }`}>
                {gainIsPositive ? '+' : '−'}{Math.abs(gainLossPct).toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="rounded-[22px] border border-border bg-gradient-to-br from-amber-500/6 via-card to-card card-elevated p-4">
            <div className="flex items-center gap-2 text-[10.5px] font-700 uppercase tracking-[0.12em] text-amber-600">
              <Layers size={13} />
              {t('investments.summary.assetTypes', { defaultValue: 'Asset types' })}
            </div>
            <p className="mt-1.5 text-[18px] font-800 text-foreground">
              {assetTypesUsed} <span className="text-[13px] font-700 text-muted-foreground">/ 6</span>
            </p>
          </div>
        </div>

        {realInvestmentAccounts.length > 0 && (
          <div className="mt-5 rounded-[24px] border border-border bg-card card-elevated">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5 max-[480px]:px-4 max-[480px]:py-3">
              <div>
                <p className="text-[11px] font-700 uppercase tracking-[0.12em] text-accent">
                  {t('investments.accounts.title', { defaultValue: 'Existing investment accounts' })}
                </p>
                <p className="mt-0.5 text-xs font-600 text-muted-foreground">
                  {t('investments.accounts.subtitle', {
                    defaultValue: 'Included in your totals above.',
                  })}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-700 text-emerald-700">
                <Sparkles size={12} /> Real data
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 p-5 sm:grid-cols-2 max-[480px]:p-4">
              {realInvestmentAccounts.map((a) => {
                const meta = getCurrencyByCode(currencies, a.currency);
                const invested = Number(a.opening_balance ?? a.current_balance ?? 0);
                const curr = Number(a.current_balance ?? a.opening_balance ?? 0);
                const delta = curr - invested;
                const pct = invested > 0 ? (delta / invested) * 100 : 0;
                const positive = delta >= 0;
                return (
                  <div key={a.id} className="rounded-2xl border border-border bg-muted/20 p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[14px] font-800 text-foreground">{a.name}</p>
                          {meta ? (
                            <span className="rounded-full border border-border bg-card px-1.5 py-0.5 text-[10.5px] font-700 text-muted-foreground">{meta.code}</span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {a.account_number_masked || a.id.slice(0, 8)}
                        </p>
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-800 ${
                        positive
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700'
                          : 'border-rose-500/20 bg-rose-500/10 text-rose-700'
                      }`}>
                        {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                        <span className="ml-1">{positive ? '+' : '−'}{Math.abs(pct).toFixed(1)}%</span>
                      </span>
                    </div>
                    <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[10px] font-700 uppercase tracking-wide text-muted-foreground">Invested</p>
                        <FormattedCurrencyAmount amount={invested} currencyCode={a.currency} className="mt-0.5 block text-[12.5px] font-800 text-foreground" />
                      </div>
                      <div>
                        <p className="text-[10px] font-700 uppercase tracking-wide text-muted-foreground">Current</p>
                        <FormattedCurrencyAmount amount={curr} currencyCode={a.currency} className="mt-0.5 block text-[12.5px] font-800 text-foreground" />
                      </div>
                      <div>
                        <p className="text-[10px] font-700 uppercase tracking-wide text-muted-foreground">Delta</p>
                        <FormattedCurrencyAmount amount={Math.abs(delta)} currencyCode={a.currency} className={`mt-0.5 block text-[12.5px] font-800 ${positive ? 'text-emerald-600' : 'text-rose-600'}`} />
                      </div>
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
                {t('investments.holdings.title', { defaultValue: 'Investment holdings' })}
              </p>
              <p className="mt-0.5 text-xs font-600 text-muted-foreground">
                {t('investments.holdings.subtitle', {
                  defaultValue: 'Add what you own; values are tracked manually, not live market data.',
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openNew()}
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
            >
              <Plus size={13} />
              {t('investments.newInvestment', { defaultValue: 'Add investment' })}
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2 xl:grid-cols-3 max-[480px]:p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-52 w-full animate-pulse rounded-[22px] bg-muted/40" />
              ))}
            </div>
          ) : investments.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={TrendingUp}
                variant="default"
                tone="accent"
                title={t('investments.empty.title', { defaultValue: 'No tracked investments yet' })}
                description={t('investments.empty.description', {
                  defaultValue:
                    'Start with a single stock, a fund, a crypto wallet, or a property. Values update manually for accuracy.',
                })}
                action={{
                  label: t('investments.empty.action', { defaultValue: 'Add your first investment' }),
                  onClick: () => openNew('stocks'),
                }}
              />
            </div>
          ) : (
            <div className="space-y-4 p-5 max-[480px]:p-4">
              {CATEGORY_OPTIONS.map((cat) => {
                const records = investments.filter((r) => r.asset_type === cat.id);
                if (records.length === 0) {
                  return (
                    <div key={cat.id} className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-border/80 bg-muted/10 px-4 py-3 max-[480px]:px-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl border border-border bg-card" style={{ color: cat.accent }}>
                          <cat.icon size={17} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-800 text-foreground">{cat.label}</p>
                          <p className="truncate text-[11px] font-600 text-muted-foreground">{cat.description}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openNew(cat.id)}
                        className="btn-ghost inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11.5px] font-800 text-accent"
                      >
                        <Plus size={13} /> Add
                      </button>
                    </div>
                  );
                }
                const invested = records.reduce((s, r) => s + toNumber(r.amount_invested), 0);
                const current = records.reduce((s, r) => s + toNumber(r.current_value), 0);
                const delta = current - invested;
                const pct = invested > 0 ? (delta / invested) * 100 : 0;
                const positive = delta >= 0;
                const totalPctBar = invested > 0 ? (current / invested) * 100 : 0;
                const Icon = cat.icon;
                return (
                  <div key={cat.id} className="overflow-hidden rounded-[22px] border border-border bg-gradient-to-br from-card via-card to-muted/15">
                    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4 max-[480px]:px-4 max-[480px]:pt-3 max-[480px]:pb-2.5">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-border" style={{ backgroundColor: `${cat.accent}14`, color: cat.accent }}>
                          <Icon size={20} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h3 className="truncate text-[15px] font-800 text-foreground">{cat.label}</h3>
                            <StatusBadge
                              status="info"
                              label={
                                records.length === 1
                                  ? '1 holding'
                                  : `${records.length} holdings`
                              }
                            />
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-600 text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Briefcase size={11} />
                              Invested{' '}
                              <span className="font-800 text-foreground">
                                <FormattedCurrencyAmount amount={invested} currencyCode={defaultCurrencyCode} textOnly />
                              </span>
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <DollarSign size={11} />
                              Value{' '}
                              <span className="font-800 text-foreground">
                                <FormattedCurrencyAmount amount={current} currencyCode={defaultCurrencyCode} textOnly />
                              </span>
                            </span>
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-800 ${
                              positive
                                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700'
                                : 'border-rose-500/20 bg-rose-500/10 text-rose-700'
                            }`}>
                              {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                              <FormattedCurrencyAmount amount={Math.abs(delta)} currencyCode={defaultCurrencyCode} textOnly />
                              <span className="ml-0.5">
                                ({positive ? '+' : '−'}{Math.abs(pct).toFixed(1)}%)
                              </span>
                            </span>
                          </div>
                          {invested > 0 ? (
                            <div className="mt-2 relative h-2 w-full overflow-hidden rounded-full bg-muted/50">
                              <div
                                className="absolute left-0 top-0 h-full rounded-full"
                                style={{
                                  width: `${Math.min(140, totalPctBar)}%`,
                                  background: `linear-gradient(90deg, ${cat.accent}ee 0%, ${cat.accent}99 100%)`,
                                }}
                              />
                              <div className="absolute top-0 h-full w-px bg-border/70" style={{ left: '100%' }} />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 border-t border-border/50 bg-muted/10 p-4 max-[480px]:p-3 md:grid-cols-2 xl:grid-cols-3">
                      {records.map((r) => {
                        const rInvested = toNumber(r.amount_invested);
                        const rCurrent = toNumber(r.current_value);
                        const rDelta = rCurrent - rInvested;
                        const rPct = rInvested > 0 ? (rDelta / rInvested) * 100 : 0;
                        const rPositive = rDelta >= 0;
                        const actionsOpen = actionsOpenFor === r.id;
                        return (
                          <div key={r.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="truncate text-[13.5px] font-800 text-foreground">{r.name}</p>
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] font-600 text-muted-foreground">
                                  <span className="rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-700 text-foreground">
                                    {r.currency}
                                  </span>
                                  {r.purchase_date ? (
                                    <span className="inline-flex items-center gap-1">
                                      <CalendarDays size={10.5} />
                                      {new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short' }).format(new Date(r.purchase_date))}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setActionsOpenFor(actionsOpen ? null : r.id)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
                                  aria-label={t('investments.holding.actions', { defaultValue: 'Investment actions' })}
                                >
                                  <MoreHorizontal size={15} />
                                </button>
                                {actionsOpen && (
                                  <>
                                    <div className="fixed inset-0 z-30" onClick={() => setActionsOpenFor(null)} />
                                    <div className={`absolute z-40 mt-1.5 w-36 overflow-hidden rounded-2xl border border-border bg-card shadow-card-lg ${isRTL ? 'left-0' : 'right-0'}`}>
                                      <button
                                        type="button"
                                        onClick={() => openEdit(r)}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-700 text-foreground transition hover:bg-muted/40"
                                      >
                                        <Edit2 size={14} />
                                        {t('investments.holding.edit', { defaultValue: 'Edit' })}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openDelete(r)}
                                        className="flex w-full items-center gap-2 border-t border-border/60 px-3 py-2 text-left text-[12.5px] font-700 text-rose-600 transition hover:bg-rose-500/10"
                                      >
                                        <Trash2 size={14} />
                                        {t('investments.holding.delete', { defaultValue: 'Delete' })}
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div>
                                <p className="text-[10px] font-700 uppercase tracking-wide text-muted-foreground">
                                  Invested
                                </p>
                                <FormattedCurrencyAmount amount={rInvested} currencyCode={r.currency} className="mt-0.5 block text-[12px] font-800 text-foreground" />
                              </div>
                              <div>
                                <p className="text-[10px] font-700 uppercase tracking-wide text-muted-foreground">
                                  Value
                                </p>
                                <FormattedCurrencyAmount amount={rCurrent} currencyCode={r.currency} className="mt-0.5 block text-[12px] font-800 text-foreground" />
                              </div>
                              <div>
                                <p className="text-[10px] font-700 uppercase tracking-wide text-muted-foreground">
                                  Gain/Loss
                                </p>
                                <div className={`mt-0.5 flex flex-col items-center gap-0.5 ${rPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  <FormattedCurrencyAmount amount={Math.abs(rDelta)} currencyCode={r.currency} textOnly className="text-[12px] font-800" />
                                  <span className="text-[10px] font-800">
                                    {rPositive ? '+' : '−'}{Math.abs(rPct).toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
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
              setEditInvestment(null);
              setForm(null);
            }
          }}
          title={editInvestment
            ? t('investments.form.editTitle', { defaultValue: 'Edit investment' })
            : t('investments.form.title', { defaultValue: 'Add investment' })}
          description={t('investments.form.description', {
            defaultValue: 'Track something you own. Enter what you paid and what it is worth today.',
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
                  setEditInvestment(null);
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
                {editInvestment
                  ? t('investments.form.update', { defaultValue: 'Update investment' })
                  : t('investments.form.create', { defaultValue: 'Add investment' })}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-700 uppercase tracking-wide text-muted-foreground">
                {t('investments.form.name', { defaultValue: 'Investment name' })}
              </label>
              <input
                type="text"
                maxLength={160}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('investments.form.namePlaceholder', { defaultValue: 'e.g. S&P 500 ETF, BTC wallet, Apartment 3B' })}
                className="input-base w-full"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-xs font-700 uppercase tracking-wide text-muted-foreground">
                  {t('investments.form.assetType', { defaultValue: 'Asset type' })}
                </label>
                <select
                  value={form.assetType}
                  onChange={(e) => setForm({ ...form, assetType: e.target.value as InvestmentAssetTypeDb })}
                  className="input-base w-full"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <CurrencySelector
                  label={t('investments.form.currency', { defaultValue: 'Currency' })}
                  value={form.currency}
                  onChange={(code) => setForm({ ...form, currency: code })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-xs font-700 uppercase tracking-wide text-muted-foreground">
                  {t('investments.form.invested', { defaultValue: 'Amount invested' })}
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.amountInvested}
                  onChange={(e) => setForm({ ...form, amountInvested: e.target.value })}
                  placeholder="5000"
                  className="input-base w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-700 uppercase tracking-wide text-muted-foreground">
                  {t('investments.form.currentValue', { defaultValue: 'Current value' })}
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.currentValue}
                  onChange={(e) => setForm({ ...form, currentValue: e.target.value })}
                  placeholder="5800"
                  className="input-base w-full"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-700 uppercase tracking-wide text-muted-foreground">
                <CalendarDays size={12} className="text-accent/80" />
                {t('investments.form.purchaseDate', { defaultValue: 'Purchase date (optional)' })}
              </label>
              <input
                type="date"
                value={form.purchaseDate}
                onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                className="input-base w-full"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-700 uppercase tracking-wide text-muted-foreground">
                {t('investments.form.notes', { defaultValue: 'Notes (optional)' })}
              </label>
              <textarea
                maxLength={1000}
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder={t('investments.form.notesPlaceholder', {
                  defaultValue: 'Ticker, location, quantity, or a quick reminder to yourself.',
                })}
                className="input-base w-full resize-y"
              />
            </div>
          </div>
        </Modal>
      )}

      <ConfirmationModal
        open={!!deleteInv}
        tone="danger"
        title={t('investments.deleteConfirm.title', { defaultValue: 'Delete investment?' })}
        description={t('investments.deleteConfirm.description', {
          defaultValue: 'This removes "{{name}}" and cannot be undone.',
        })}
        confirmLabel={t('investments.deleteConfirm.confirm', { defaultValue: 'Delete investment' })}
        cancelLabel={t('common.actions.cancel', { defaultValue: 'Cancel' })}
        pending={isDeleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => {
          if (!isDeleting) setDeleteInv(null);
        }}
      />
    </AppLayout>
  );
}
