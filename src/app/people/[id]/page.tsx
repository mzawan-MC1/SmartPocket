'use client';
import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Wallet, TrendingUp, TrendingDown, Plus,
  FileText, RotateCcw, User, BarChart3, Edit2, DollarSign
} from 'lucide-react';
import {
  getManagedPerson, getPersonLedger, getReimbursements, getSettlements,
  addLedgerEntry, createReimbursement,
  type ManagedPerson, type PersonLedgerEntry, type Reimbursement, type Settlement
} from '@/lib/people';

import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';


const RELATIONSHIP_LABELS: Record<string, string> = {
  spouse: 'Spouse', child: 'Child', parent: 'Parent', sibling: 'Sibling',
  friend: 'Friend', relative: 'Relative', colleague: 'Colleague', client: 'Client', other: 'Other',
};

const ENTRY_TYPE_LABELS: Record<string, { label: string; color: string; sign: '+' | '-' }> = {
  money_received:           { label: 'Money Received',         color: 'text-positive',  sign: '+' },
  money_returned:           { label: 'Money Returned',         color: 'text-negative',  sign: '-' },
  expense_from_held:        { label: 'Expense (Held Balance)', color: 'text-negative',  sign: '-' },
  expense_paid_by_user:     { label: 'Expense (Paid by Me)',   color: 'text-warning',   sign: '-' },
  expense_paid_by_person:   { label: 'Expense (Paid by Person)', color: 'text-muted-foreground', sign: '-' },
  reimbursement_due_to_user:   { label: 'Reimbursement Due to Me',     color: 'text-positive', sign: '+' },
  reimbursement_due_to_person: { label: 'Reimbursement Due to Person', color: 'text-negative', sign: '-' },
  reimbursement_received:   { label: 'Reimbursement Received', color: 'text-positive',  sign: '+' },
  reimbursement_paid:       { label: 'Reimbursement Paid',     color: 'text-negative',  sign: '-' },
  settlement:               { label: 'Settlement',             color: 'text-info',      sign: '+' },
  adjustment:               { label: 'Adjustment',             color: 'text-muted-foreground', sign: '+' },
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning-soft text-warning',
  partially_paid: 'bg-info-soft text-info',
  settled: 'bg-positive-soft text-positive',
  waived: 'bg-muted text-muted-foreground',
  cancelled: 'bg-negative-soft text-negative',
};

const TABS = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'ledger', label: 'Ledger', icon: FileText },
  { id: 'reimbursements', label: 'Reimbursements', icon: RotateCcw },
  { id: 'settlements', label: 'Settlements', icon: DollarSign },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

function formatAmt(amount: number, currency = 'AED') {
  return `${currency} ${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Quick Transaction Modal ──────────────────────────────────────────────────
interface QuickTxnModalProps {
  person: ManagedPerson;
  onClose: () => void;
  onSuccess: () => void;
}

function QuickTransactionModal({ person, onClose, onSuccess }: QuickTxnModalProps) {
  const [entryType, setEntryType] = useState<string>('money_received');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState(person.preferred_currency || 'AED');
  const [saving, setSaving] = useState(false);
  const [createReimb, setCreateReimb] = useState(false);

  const QUICK_TYPES = [
    { value: 'money_received', label: 'Money Received from Person' },
    { value: 'money_returned', label: 'Money Returned to Person' },
    { value: 'expense_from_held', label: 'Expense from Held Balance' },
    { value: 'expense_paid_by_user', label: 'Expense Paid by Me for Person' },
    { value: 'expense_paid_by_person', label: 'Expense Paid by Person' },
    { value: 'reimbursement_received', label: 'Reimbursement Received' },
    { value: 'reimbursement_paid', label: 'Reimbursement Paid' },
    { value: 'settlement', label: 'Settlement' },
    { value: 'adjustment', label: 'Manual Adjustment' },
  ];

  const handleSave = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!description.trim()) {
      toast.error('Description is required');
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

      toast.success('Transaction recorded');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to record transaction');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-card-md w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-700 text-foreground">Record Transaction</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">✕</button>
        </div>

        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Transaction Type</label>
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
            <label className="block text-sm font-600 text-foreground mb-1.5">Amount</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              min="0.01"
              step="0.01"
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {['AED', 'USD', 'EUR', 'GBP', 'SAR'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Government fee, Subscription..."
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
            <span className="text-sm text-foreground">Create reimbursement ({person.full_name} owes me)</span>
          </label>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-600 text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Record'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PersonDetailPage() {
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
      toast.error('Failed to load person data');
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useEffect(() => { loadData(); }, [loadData]);

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
          <p className="text-muted-foreground">Person not found</p>
          <Link href="/people" className="text-accent text-sm mt-2 inline-block">← Back to People</Link>
        </div>
      </AppLayout>
    );
  }

  const pendingReimbs = reimbursements.filter((r) => r.status === 'pending' || r.status === 'partially_paid');

  return (
    <AppLayout activeRoute="/people">
      <div className="space-y-5 pb-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/people" className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-xl font-700 text-foreground">{person.full_name}</h1>
              <p className="text-sm text-muted-foreground capitalize">{RELATIONSHIP_LABELS[person.relationship] || 'Other'}</p>
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
              onClick={() => setShowTxnModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow hover:opacity-90 transition-opacity"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Record</span>
            </button>
          </div>
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet size={15} className="text-info" />
              <span className="text-xs font-600 text-muted-foreground">Money Held</span>
            </div>
            <p className="text-lg font-700 text-foreground">{formatAmt(person.money_held ?? 0, person.preferred_currency)}</p>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={15} className="text-positive" />
              <span className="text-xs font-600 text-muted-foreground">Owes Me</span>
            </div>
            <p className="text-lg font-700 text-positive">{formatAmt(person.person_owes_user ?? 0, person.preferred_currency)}</p>
          </div>
          <div className="card p-4 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown size={15} className="text-negative" />
              <span className="text-xs font-600 text-muted-foreground">I Owe</span>
            </div>
            <p className="text-lg font-700 text-negative">{formatAmt(person.user_owes_person ?? 0, person.preferred_currency)}</p>
          </div>
        </div>

        {/* Pending Reimbursements Alert */}
        {pendingReimbs.length > 0 && (
          <div className="bg-warning-soft border border-warning/20 rounded-xl p-4 flex items-center gap-3">
            <RotateCcw size={18} className="text-warning flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-600 text-foreground">
                {pendingReimbs.length} pending reimbursement{pendingReimbs.length > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                Outstanding: {formatAmt(
                  pendingReimbs.reduce((s, r) => s + (Number(r.amount) - Number(r.amount_paid)), 0),
                  person.preferred_currency
                )}
              </p>
            </div>
            <button
              onClick={() => setActiveTab('reimbursements')}
              className="text-xs font-600 text-warning hover:underline"
            >
              View
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto scrollbar-none border-b border-border">
          {TABS.map((tab) => {
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
                <p className="text-xs text-muted-foreground mb-1">Total Received</p>
                <p className="text-base font-700 text-foreground">{formatAmt(person.total_received ?? 0, person.preferred_currency)}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Expenses</p>
                <p className="text-base font-700 text-foreground">{formatAmt(person.total_expenses ?? 0, person.preferred_currency)}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-muted-foreground mb-1">Reimbursements</p>
                <p className="text-base font-700 text-foreground">{reimbursements.length}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-muted-foreground mb-1">Settlements</p>
                <p className="text-base font-700 text-foreground">{settlements.length}</p>
              </div>
            </div>

            {/* Profile Info */}
            <div className="card p-5 space-y-3">
              <h3 className="text-sm font-700 text-foreground">Profile</h3>
              {person.email && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Email</span>
                  <span className="text-foreground">{person.email}</span>
                </div>
              )}
              {person.phone && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Phone</span>
                  <span className="text-foreground">{person.phone}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Currency</span>
                <span className="text-foreground">{person.preferred_currency}</span>
              </div>
              {person.notes && (
                <div className="text-sm">
                  <span className="text-muted-foreground block mb-1">Notes</span>
                  <span className="text-foreground">{person.notes}</span>
                </div>
              )}
            </div>

            {/* Recent Ledger */}
            {ledger.length > 0 && (
              <div className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-700 text-foreground">Recent Activity</h3>
                  <button onClick={() => setActiveTab('ledger')} className="text-xs text-accent font-600 hover:underline">View All</button>
                </div>
                <div className="space-y-2">
                  {ledger.slice(0, 5).map((entry) => {
                    const meta = ENTRY_TYPE_LABELS[entry.entry_type] || { label: entry.entry_type, color: 'text-foreground', sign: '+' as const };
                    return (
                      <div key={entry.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div>
                          <p className="text-sm font-500 text-foreground">{entry.description}</p>
                          <p className="text-xs text-muted-foreground">{meta.label} · {entry.entry_date}</p>
                        </div>
                        <span className={`text-sm font-700 ${meta.color}`}>
                          {meta.sign}{entry.currency} {Number(entry.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
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
                <p className="text-muted-foreground">No ledger entries yet</p>
                <button onClick={() => setShowTxnModal(true)} className="mt-4 text-accent text-sm font-600 hover:underline">
                  Record first transaction
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {ledger.map((entry) => {
                  const meta = ENTRY_TYPE_LABELS[entry.entry_type] || { label: entry.entry_type, color: 'text-foreground', sign: '+' as const };
                  return (
                    <div key={entry.id} className="flex items-center justify-between p-4">
                      <div>
                        <p className="text-sm font-600 text-foreground">{entry.description}</p>
                        <p className="text-xs text-muted-foreground">{meta.label}</p>
                        <p className="text-xs text-muted-foreground">{entry.entry_date}</p>
                      </div>
                      <span className={`text-sm font-700 ${meta.color}`}>
                        {meta.sign}{entry.currency} {Number(entry.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
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
                <p className="text-muted-foreground">No reimbursements yet</p>
              </div>
            ) : (
              reimbursements.map((r) => (
                <div key={r.id} className="card p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-600 text-foreground">{r.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.owed_by === 'person' ? `${person.full_name} owes me` : `I owe ${person.full_name}`}
                      </p>
                      <p className="text-xs text-muted-foreground">{r.created_at.slice(0, 10)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-700 text-foreground">
                        {r.currency} {Number(r.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                      {Number(r.amount_paid) > 0 && (
                        <p className="text-xs text-positive">
                          Paid: {r.currency} {Number(r.amount_paid).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                      )}
                      <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-500 ${STATUS_COLORS[r.status] || 'bg-muted text-muted-foreground'}`}>
                        {r.status.replace('_', ' ')}
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
                <p className="text-muted-foreground">No settlements yet</p>
              </div>
            ) : (
              settlements.map((s) => (
                <div key={s.id} className="card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-600 text-foreground">{s.description}</p>
                      <p className="text-xs text-muted-foreground">{s.payment_method} · {s.settlement_date}</p>
                    </div>
                    <p className="text-sm font-700 text-positive">
                      {s.currency} {Number(s.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
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
              <h3 className="text-base font-700 text-foreground mb-1">Person Report</h3>
              <p className="text-sm text-muted-foreground">
                Total Received: {formatAmt(person.total_received ?? 0, person.preferred_currency)}<br />
                Total Expenses: {formatAmt(person.total_expenses ?? 0, person.preferred_currency)}<br />
                Money Held: {formatAmt(person.money_held ?? 0, person.preferred_currency)}<br />
                Owes Me: {formatAmt(person.person_owes_user ?? 0, person.preferred_currency)}<br />
                I Owe: {formatAmt(person.user_owes_person ?? 0, person.preferred_currency)}
              </p>
            </div>
            <Link
              href={`/reports?person=${person.id}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-600 text-foreground hover:bg-muted transition-colors"
            >
              <BarChart3 size={15} />
              Full Reports
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
    </AppLayout>
  );
}
