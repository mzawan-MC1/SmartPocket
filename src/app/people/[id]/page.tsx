'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import AppLayout from '@/components/AppLayout';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Wallet, TrendingUp, TrendingDown, Plus,
  FileText, RotateCcw, User, BarChart3, Edit2, DollarSign
} from 'lucide-react';
import CurrencySelector from '@/components/CurrencySelector';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import AddTransactionModal from '@/app/transactions/components/AddTransactionModal';
import { useClientReferenceData } from '@/lib/reference-data/client';
import {
  getManagedPerson, getPersonLedger, getReimbursements, getSettlements,
  addLedgerEntry, createReimbursement,
  type ManagedPerson, type PersonLedgerEntry, type Reimbursement, type Settlement
} from '@/lib/people';
import { useSmartPocketDataChanged } from '@/lib/data-change';

import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import SubscriptionFeatureGate from '@/components/subscription/SubscriptionFeatureGate';


const ENTRY_TYPE_STYLES: Record<string, { color: string; sign: '+' | '-' }> = {
  money_received: { color: 'text-positive', sign: '+' },
  money_returned: { color: 'text-negative', sign: '-' },
  expense_from_held: { color: 'text-negative', sign: '-' },
  expense_paid_by_user: { color: 'text-warning', sign: '-' },
  expense_paid_by_person: { color: 'text-muted-foreground', sign: '-' },
  reimbursement_due_to_user: { color: 'text-positive', sign: '+' },
  reimbursement_due_to_person: { color: 'text-negative', sign: '-' },
  reimbursement_received: { color: 'text-positive', sign: '+' },
  reimbursement_paid: { color: 'text-negative', sign: '-' },
  settlement: { color: 'text-info', sign: '+' },
  adjustment: { color: 'text-muted-foreground', sign: '+' },
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning-soft text-warning',
  partially_paid: 'bg-info-soft text-info',
  settled: 'bg-positive-soft text-positive',
  waived: 'bg-muted text-muted-foreground',
  cancelled: 'bg-negative-soft text-negative',
};

// ─── Quick Transaction Modal ──────────────────────────────────────────────────
interface QuickTxnModalProps {
  person: ManagedPerson;
  onClose: () => void;
  onSuccess: () => void;
}

function QuickTransactionModal({ person, onClose, onSuccess }: QuickTxnModalProps) {
  const { t } = useTranslation(['portal', 'common']);
  const { data: referenceData } = useClientReferenceData();
  const initialCurrency = person.preferred_currency || referenceData?.platformDefaultCurrency || '';
  const [entryType, setEntryType] = useState<string>('money_received');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState(initialCurrency);
  const [saving, setSaving] = useState(false);
  const [createReimb, setCreateReimb] = useState(false);

  useEffect(() => {
    if (!initialCurrency || currency) return;
    setCurrency(initialCurrency);
  }, [currency, initialCurrency]);

  const QUICK_TYPES = [
    { value: 'money_received', label: t('people.quickTransaction.types.moneyReceived', { ns: 'portal' }) },
    { value: 'money_returned', label: t('people.quickTransaction.types.moneyReturned', { ns: 'portal' }) },
    { value: 'expense_from_held', label: t('people.quickTransaction.types.expenseFromHeld', { ns: 'portal' }) },
    { value: 'expense_paid_by_user', label: t('people.quickTransaction.types.expensePaidByUser', { ns: 'portal' }) },
    { value: 'expense_paid_by_person', label: t('people.quickTransaction.types.expensePaidByPerson', { ns: 'portal' }) },
    { value: 'reimbursement_received', label: t('people.quickTransaction.types.reimbursementReceived', { ns: 'portal' }) },
    { value: 'reimbursement_paid', label: t('people.quickTransaction.types.reimbursementPaid', { ns: 'portal' }) },
    { value: 'settlement', label: t('people.quickTransaction.types.settlement', { ns: 'portal' }) },
    { value: 'adjustment', label: t('people.quickTransaction.types.adjustment', { ns: 'portal' }) },
  ];

  const handleSave = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error(t('people.quickTransaction.validAmountError', { ns: 'portal' }));
      return;
    }
    if (!description.trim()) {
      toast.error(t('people.quickTransaction.descriptionRequired', { ns: 'portal' }));
      return;
    }
    setSaving(true);
    try {
      const entry = await addLedgerEntry({
        person_id: person.id,
        entry_type: entryType as any,
        amount: Number(amount),
        currency,
        description: description.trim(),
        entry_date: new Date().toISOString().slice(0, 10),
      });

      // Auto-create reimbursement if expense paid by user
      if (createReimb && entryType === 'expense_paid_by_user') {
        await createReimbursement({
          person_id: person.id,
          ledger_entry_id: entry.id,
          amount: Number(amount),
          currency,
          owed_by: 'person',
          owed_to: 'user',
          description: description.trim(),
        });
      }

      toast.success(t('people.quickTransaction.recorded', { ns: 'portal' }));
      onSuccess();
      onClose();
    } catch (err: unknown) {
      toast.error((err as Error).message || t('people.quickTransaction.recordFailed', { ns: 'portal' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-card-md w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-700 text-foreground">{t('people.quickTransaction.title', { ns: 'portal' })}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">✕</button>
        </div>

        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">{t('people.quickTransaction.transactionType', { ns: 'portal' })}</label>
          <select
            value={entryType}
            onChange={(e) => setEntryType(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            {QUICK_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.amount', { ns: 'portal' })}</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t('settlements.amountPlaceholder', { ns: 'portal' })}
              min="0.01"
              step="0.01"
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.currency', { ns: 'portal' })}</label>
            <CurrencySelector value={currency} onChange={setCurrency} placeholder={t('people.form.chooseCurrency', { ns: 'portal' })} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.descriptionLabel', { ns: 'portal' })}</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('people.quickTransaction.descriptionPlaceholder', { ns: 'portal' })}
            className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>

        {entryType === 'expense_paid_by_user' && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={createReimb}
              onChange={(e) => setCreateReimb(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-foreground">{t('people.quickTransaction.createReimbursement', { ns: 'portal', name: person.full_name })}</span>
          </label>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-600 text-muted-foreground hover:bg-muted transition-colors"
          >
            {t('actions.cancel', { ns: 'common' })}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {saving ? t('status.saving', { ns: 'common' }) : t('people.quickTransaction.record', { ns: 'portal' })}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PersonDetailPage() {
  const { t } = useTranslation(['portal', 'common']);
  const params = useParams();
  const searchParams = useSearchParams();
  const personId = params.id as string;

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview');
  const [person, setPerson] = useState<ManagedPerson | null>(null);
  const [ledger, setLedger] = useState<PersonLedgerEntry[]>([]);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [showRepaymentModal, setShowRepaymentModal] = useState(false);

  const tabs = [
    { id: 'overview', label: t('people.detail.tabs.overview', { ns: 'portal' }), icon: User },
    { id: 'ledger', label: t('people.detail.tabs.ledger', { ns: 'portal' }), icon: FileText },
    { id: 'reimbursements', label: t('reimbursements.title', { ns: 'portal' }), icon: RotateCcw },
    { id: 'settlements', label: t('settlements.title', { ns: 'portal' }), icon: DollarSign },
    { id: 'reports', label: t('reports.pageTitle', { ns: 'portal' }), icon: BarChart3 },
  ] as const;

  const getEntryTypeMeta = (entryType: string) => {
    const style = ENTRY_TYPE_STYLES[entryType] || { color: 'text-foreground', sign: '+' as const };
    const label =
      entryType === 'money_received'
        ? t('people.detail.entryTypes.moneyReceived', { ns: 'portal' })
        : entryType === 'money_returned'
          ? t('people.detail.entryTypes.moneyReturned', { ns: 'portal' })
          : entryType === 'expense_from_held'
            ? t('people.detail.entryTypes.expenseFromHeld', { ns: 'portal' })
            : entryType === 'expense_paid_by_user'
              ? t('people.detail.entryTypes.expensePaidByUser', { ns: 'portal' })
              : entryType === 'expense_paid_by_person'
                ? t('people.detail.entryTypes.expensePaidByPerson', { ns: 'portal' })
                : entryType === 'reimbursement_due_to_user'
                  ? t('people.detail.entryTypes.reimbursementDueToUser', { ns: 'portal' })
                  : entryType === 'reimbursement_due_to_person'
                    ? t('people.detail.entryTypes.reimbursementDueToPerson', { ns: 'portal' })
                    : entryType === 'reimbursement_received'
                      ? t('people.detail.entryTypes.reimbursementReceived', { ns: 'portal' })
                      : entryType === 'reimbursement_paid'
                        ? t('people.detail.entryTypes.reimbursementPaid', { ns: 'portal' })
                        : entryType === 'settlement'
                          ? t('people.detail.entryTypes.settlement', { ns: 'portal' })
                          : entryType === 'adjustment'
                            ? t('people.detail.entryTypes.adjustment', { ns: 'portal' })
                            : entryType;
    return { ...style, label };
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [p, l, r, s] = await Promise.all([
        getManagedPerson(personId),
        getPersonLedger(personId),
        getReimbursements({ personId }),
        getSettlements(personId),
      ]);
      setPerson(p);
      setLedger(l);
      setReimbursements(r);
      setSettlements(s);
    } catch {
      toast.error(t('people.detail.loadFailed', { ns: 'portal' }));
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useEffect(() => { loadData(); }, [loadData]);
  useSmartPocketDataChanged(['people', 'settlements', 'transactions', 'financial_accounts', 'dashboard'], 'PersonDetailPage', async () => {
    await loadData();
  });

  if (loading) {
    return (
      <AppLayout activeRoute="/people">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="card p-6 h-32 bg-muted" />
        </div>
      </AppLayout>
    );
  }

  if (!person) {
    return (
      <AppLayout activeRoute="/people">
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('people.detail.notFound', { ns: 'portal' })}</p>
          <Link href="/people" className="text-accent text-sm mt-2 inline-block">{t('people.detail.backToPeople', { ns: 'portal' })}</Link>
        </div>
      </AppLayout>
    );
  }

  const pendingReimbs = reimbursements.filter((r) => r.status === 'pending' || r.status === 'partially_paid');

  return (
    <AppLayout activeRoute="/people">
      <SubscriptionFeatureGate feature="managed_people">
        <div className="space-y-5 pb-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/people" className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-xl font-700 text-foreground">{person.full_name}</h1>
              <p className="text-sm text-muted-foreground capitalize">
                {t(`people.relationships.${person.relationship}` as const, {
                  ns: 'portal',
                  defaultValue: t('people.relationships.other', { ns: 'portal' }),
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/people/${person.id}/edit`}
              className="p-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground"
            >
              <Edit2 size={16} />
            </Link>
            <button
              onClick={() => setShowRepaymentModal(true)}
              className="rounded-xl border border-border px-4 py-2 text-sm font-600 text-foreground hover:bg-muted transition-colors"
            >
              {t('people.detail.recordRepayment', { ns: 'portal', defaultValue: 'Record Repayment' })}
            </button>
            <button
              onClick={() => setShowTxnModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow hover:opacity-90 transition-opacity"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">{t('people.quickTransaction.record', { ns: 'portal' })}</span>
            </button>
          </div>
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet size={15} className="text-info" />
              <span className="text-xs font-600 text-muted-foreground">{t('people.moneyHeld', { ns: 'portal' })}</span>
            </div>
            <FormattedCurrencyAmount amount={person.money_held ?? 0} currencyCode={person.preferred_currency} className="text-lg font-700 text-foreground" showCode />
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={15} className="text-positive" />
              <span className="text-xs font-600 text-muted-foreground">{t('people.owesMe', { ns: 'portal' })}</span>
            </div>
            <FormattedCurrencyAmount amount={person.person_owes_user ?? 0} currencyCode={person.preferred_currency} className="text-lg font-700 text-positive" showCode />
          </div>
          <div className="card p-4 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown size={15} className="text-negative" />
              <span className="text-xs font-600 text-muted-foreground">{t('people.iOwe', { ns: 'portal' })}</span>
            </div>
            <FormattedCurrencyAmount amount={person.user_owes_person ?? 0} currencyCode={person.preferred_currency} className="text-lg font-700 text-negative" showCode />
          </div>
        </div>

        {/* Pending Reimbursements Alert */}
        {pendingReimbs.length > 0 && (
          <div className="bg-warning-soft border border-warning/20 rounded-xl p-4 flex items-center gap-3">
            <RotateCcw size={18} className="text-warning flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-600 text-foreground">
                {t('people.detail.pendingReimbursementsCount', { ns: 'portal', count: pendingReimbs.length })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('reimbursements.outstanding', { ns: 'portal' })}:
                <FormattedCurrencyAmount
                  amount={pendingReimbs.reduce((s, r) => s + (Number(r.amount) - Number(r.amount_paid)), 0)}
                  currencyCode={person.preferred_currency}
                  className="ml-1 text-xs text-muted-foreground"
                  showCode
                />
              </p>
            </div>
            <button
              onClick={() => setActiveTab('reimbursements')}
              className="text-xs font-600 text-warning hover:underline"
            >
              {t('actions.view', { ns: 'common' })}
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto scrollbar-none border-b border-border">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-600 whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-accent text-accent' :'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="card p-4">
                <p className="text-xs text-muted-foreground mb-1">{t('people.detail.totalReceived', { ns: 'portal' })}</p>
                <FormattedCurrencyAmount amount={person.total_received ?? 0} currencyCode={person.preferred_currency} className="text-base font-700 text-foreground" showCode />
              </div>
              <div className="card p-4">
                <p className="text-xs text-muted-foreground mb-1">{t('people.detail.totalExpenses', { ns: 'portal' })}</p>
                <FormattedCurrencyAmount amount={person.total_expenses ?? 0} currencyCode={person.preferred_currency} className="text-base font-700 text-foreground" showCode />
              </div>
              <div className="card p-4">
                <p className="text-xs text-muted-foreground mb-1">{t('reimbursements.title', { ns: 'portal' })}</p>
                <p className="text-base font-700 text-foreground">{reimbursements.length}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-muted-foreground mb-1">{t('settlements.title', { ns: 'portal' })}</p>
                <p className="text-base font-700 text-foreground">{settlements.length}</p>
              </div>
            </div>

            {/* Profile Info */}
            <div className="card p-5 space-y-3">
              <h3 className="text-sm font-700 text-foreground">{t('people.detail.profile', { ns: 'portal' })}</h3>
              {person.email && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('people.form.email', { ns: 'portal' })}</span>
                  <span className="text-foreground">{person.email}</span>
                </div>
              )}
              {person.phone && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('people.form.phone', { ns: 'portal' })}</span>
                  <span className="text-foreground">{person.phone}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('settlements.currency', { ns: 'portal' })}</span>
                <span className="text-foreground">{person.preferred_currency}</span>
              </div>
              {person.notes && (
                <div className="text-sm">
                  <span className="text-muted-foreground block mb-1">{t('people.form.notes', { ns: 'portal' })}</span>
                  <span className="text-foreground">{person.notes}</span>
                </div>
              )}
            </div>

            {/* Recent Ledger */}
            {ledger.length > 0 && (
              <div className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-700 text-foreground">{t('people.detail.recentActivity', { ns: 'portal' })}</h3>
                  <button onClick={() => setActiveTab('ledger')} className="text-xs text-accent font-600 hover:underline">{t('actions.viewAll', { ns: 'common' })}</button>
                </div>
                <div className="space-y-2">
                  {ledger.slice(0, 5).map((entry) => {
                    const meta = getEntryTypeMeta(entry.entry_type);
                    return (
                      <div key={entry.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div>
                          <p className="text-sm font-500 text-foreground">{entry.description}</p>
                          <p className="text-xs text-muted-foreground">{meta.label} · {entry.entry_date}</p>
                        </div>
                        <FormattedCurrencyAmount
                          amount={meta.sign === '-' ? -Math.abs(Number(entry.amount)) : Number(entry.amount)}
                          currencyCode={entry.currency}
                          className={`text-sm font-700 ${meta.color}`}
                          showCode
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'ledger' && (
          <div className="card">
            {ledger.length === 0 ? (
              <div className="p-12 text-center">
                <FileText size={40} className="mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">{t('people.detail.noLedgerEntries', { ns: 'portal' })}</p>
                <button onClick={() => setShowTxnModal(true)} className="mt-4 text-accent text-sm font-600 hover:underline">
                  {t('people.detail.recordFirstTransaction', { ns: 'portal' })}
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {ledger.map((entry) => {
                  const meta = getEntryTypeMeta(entry.entry_type);
                  return (
                    <div key={entry.id} className="flex items-center justify-between p-4">
                      <div>
                        <p className="text-sm font-600 text-foreground">{entry.description}</p>
                        <p className="text-xs text-muted-foreground">{meta.label}</p>
                        <p className="text-xs text-muted-foreground">{entry.entry_date}</p>
                      </div>
                      <FormattedCurrencyAmount
                        amount={meta.sign === '-' ? -Math.abs(Number(entry.amount)) : Number(entry.amount)}
                        currencyCode={entry.currency}
                        className={`text-sm font-700 ${meta.color}`}
                        showCode
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'reimbursements' && (
          <div className="space-y-3">
            {reimbursements.length === 0 ? (
              <div className="card p-12 text-center">
                <RotateCcw size={40} className="mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">{t('people.detail.noReimbursementsYet', { ns: 'portal' })}</p>
              </div>
            ) : (
              reimbursements.map((r) => (
                <div key={r.id} className="card p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-600 text-foreground">{r.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.owed_by === 'person'
                          ? t('people.detail.personOwesMe', { ns: 'portal', name: person.full_name })
                          : t('people.detail.iOwePerson', { ns: 'portal', name: person.full_name })}
                      </p>
                      <p className="text-xs text-muted-foreground">{r.created_at.slice(0, 10)}</p>
                    </div>
                    <div className="text-right">
                      <FormattedCurrencyAmount amount={Number(r.amount)} currencyCode={r.currency} className="text-sm font-700 text-foreground" showCode />
                      {Number(r.amount_paid) > 0 && (
                        <div className="text-xs text-positive">
                          {t('reimbursements.paid', { ns: 'portal' })}: <FormattedCurrencyAmount amount={Number(r.amount_paid)} currencyCode={r.currency} className="inline-flex text-xs text-positive" showCode />
                        </div>
                      )}
                      <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-500 ${STATUS_COLORS[r.status] || 'bg-muted text-muted-foreground'}`}>
                        {t(`reimbursements.statuses.${r.status}` as const, {
                          ns: 'portal',
                          defaultValue: r.status,
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'settlements' && (
          <div className="space-y-3">
            {settlements.length === 0 ? (
              <div className="card p-12 text-center">
                <DollarSign size={40} className="mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">{t('people.detail.noSettlementsYet', { ns: 'portal' })}</p>
              </div>
            ) : (
              settlements.map((s) => (
                <div key={s.id} className="card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-600 text-foreground">{s.description}</p>
                      <p className="text-xs text-muted-foreground">{s.payment_method} · {s.settlement_date}</p>
                    </div>
                    <FormattedCurrencyAmount amount={Number(s.amount)} currencyCode={s.currency} className="text-sm font-700 text-positive" showCode />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="card p-6 text-center space-y-4">
            <BarChart3 size={40} className="mx-auto text-muted-foreground/40" />
            <div>
              <h3 className="text-base font-700 text-foreground mb-1">{t('people.detail.personReport', { ns: 'portal' })}</h3>
              <p className="text-sm text-muted-foreground">
                {t('people.detail.totalReceived', { ns: 'portal' })}: <FormattedCurrencyAmount amount={Number(person.total_received ?? 0)} currencyCode={person.preferred_currency} className="inline-flex" /><br />
                {t('people.detail.totalExpenses', { ns: 'portal' })}: <FormattedCurrencyAmount amount={Number(person.total_expenses ?? 0)} currencyCode={person.preferred_currency} className="inline-flex" /><br />
                {t('people.moneyHeld', { ns: 'portal' })}: <FormattedCurrencyAmount amount={Number(person.money_held ?? 0)} currencyCode={person.preferred_currency} className="inline-flex" /><br />
                {t('people.owesMe', { ns: 'portal' })}: <FormattedCurrencyAmount amount={Number(person.person_owes_user ?? 0)} currencyCode={person.preferred_currency} className="inline-flex" /><br />
                {t('people.iOwe', { ns: 'portal' })}: <FormattedCurrencyAmount amount={Number(person.user_owes_person ?? 0)} currencyCode={person.preferred_currency} className="inline-flex" />
              </p>
            </div>
            <Link
              href={`/reports?person=${person.id}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-600 text-foreground hover:bg-muted transition-colors"
            >
              <BarChart3 size={15} />
              {t('people.detail.fullReports', { ns: 'portal' })}
            </Link>
          </div>
        )}
      </div>

        {showTxnModal && (
          <QuickTransactionModal
            person={person}
            onClose={() => setShowTxnModal(false)}
            onSuccess={loadData}
          />
        )}
        <AddTransactionModal
          isOpen={showRepaymentModal}
          onClose={() => setShowRepaymentModal(false)}
          initialMode="single"
          initialTransactionType="expense"
          initialEntryKind="loan_repayment"
          preselectedPersonId={person.id}
          onSaved={loadData}
        />
      </SubscriptionFeatureGate>
    </AppLayout>
  );
}
