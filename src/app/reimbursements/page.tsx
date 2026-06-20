'use client';
import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { RotateCcw } from 'lucide-react';
import { getReimbursements, getManagedPeople, recordReimbursementPayment, type Reimbursement, type ManagedPerson, type ReimbursementStatus } from '@/lib/people';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import SearchField from '@/components/ui/SearchField';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useSmartPocketDataChanged } from '@/lib/data-change';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning-soft text-warning border border-warning/20',
  partially_paid: 'bg-info-soft text-info border border-info/20',
  settled: 'bg-positive-soft text-positive border border-positive/20',
  waived: 'bg-muted text-muted-foreground border border-border',
  cancelled: 'bg-negative-soft text-negative border border-negative/20',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', partially_paid: 'Partially Paid',
  settled: 'Settled', waived: 'Waived', cancelled: 'Cancelled',
};

function normalizeCurrencyCode(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized.length === 3 ? normalized : 'USD';
}

interface PaymentModalProps {
  reimbursement: Reimbursement;
  onClose: () => void;
  onSuccess: () => void;
}

function PaymentModal({ reimbursement, onClose, onSuccess }: PaymentModalProps) {
  const remaining = Number(reimbursement.amount) - Number(reimbursement.amount_paid);
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0 || amt > remaining) {
      toast.error(`Amount must be between 0.01 and ${remaining.toFixed(2)}`);
      return;
    }
    setSaving(true);
    try {
      await recordReimbursementPayment(reimbursement.id, amt, method, notes || undefined);
      toast.success('Payment recorded');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-card-md w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-700 text-foreground">Record Payment</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">✕</button>
        </div>
        <div className="bg-muted rounded-xl p-3 text-sm">
          <p className="font-600 text-foreground">{reimbursement.description}</p>
          <div className="text-muted-foreground mt-0.5 inline-flex items-center gap-1">
            Outstanding:
            <FormattedCurrencyAmount amount={remaining} currencyCode={reimbursement.currency} className="text-sm text-muted-foreground" showCode />
          </div>
        </div>
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Payment Amount</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            min="0.01" max={remaining} step="0.01"
            className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
        </div>
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Payment Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="card">Card</option>
            <option value="digital_wallet">Digital Wallet</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional"
            className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow hover:opacity-90 disabled:opacity-60">
            {saving ? 'Saving...' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReimbursementsPage() {
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [people, setPeople] = useState<ManagedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPerson, setFilterPerson] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [payingReimb, setPayingReimb] = useState<Reimbursement | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([getReimbursements(), getManagedPeople()]);
      setReimbursements(r);
      setPeople(p);
    } catch { toast.error('Failed to load reimbursements'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useSmartPocketDataChanged(['reimbursements', 'people', 'settlements'], 'ReimbursementsPage', async () => {
    await loadData();
  });

  const filtered = reimbursements.filter((r) => {
    const matchStatus = filterStatus === 'all' || r.status === filterStatus;
    const matchPerson = filterPerson === 'all' || r.person_id === filterPerson;
    const matchSearch = !search || r.description.toLowerCase().includes(search.toLowerCase()) ||
      r.person?.full_name.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchPerson && matchSearch;
  });

  const totalPendingByCurrency = Array.from(
    reimbursements
      .filter((r) => r.status === 'pending' || r.status === 'partially_paid')
      .reduce((map, reimbursement) => {
        const currency = normalizeCurrencyCode(reimbursement.currency);
        map.set(currency, (map.get(currency) || 0) + (Number(reimbursement.amount) - Number(reimbursement.amount_paid)));
        return map;
      }, new Map<string, number>())
  ).map(([currency, amount]) => ({ currency, amount }));

  return (
    <AppLayout activeRoute="/reimbursements">
      <div className="page-section pb-6 max-[480px]:gap-3">
        <PageHeader
          title="Reimbursements"
          description="Track money owed between you and other people, with quick status visibility."
          badge={<StatusBadge status="info" label="People balances" />}
          compact
          className="max-[480px]:gap-2 [&_.page-subtitle]:max-[480px]:hidden"
        />

        {/* Summary */}
        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-3">
          <div className="card p-4 max-[480px]:p-3">
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1">Pending</p>
            <p className="text-lg font-700 text-warning">
              {reimbursements.filter((r) => r.status === 'pending').length}
            </p>
          </div>
          <div className="card p-4 max-[480px]:p-3">
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1">Outstanding</p>
            <div className="text-lg font-700 text-foreground">
              {totalPendingByCurrency.map((row) => (
                <FormattedCurrencyAmount
                  key={row.currency}
                  amount={row.amount}
                  currencyCode={row.currency}
                  className="text-lg font-700 text-foreground"
                  showCode
                />
              ))}
            </div>
          </div>
          <div className="card p-4 max-[480px]:p-3">
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1">Settled</p>
            <p className="text-lg font-700 text-positive">
              {reimbursements.filter((r) => r.status === 'settled').length}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchField
            type="text"
            placeholder="Search reimbursements..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            wrapperClassName="flex-1"
            inputClassName="bg-card h-[42px]"
          />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
            <option value="all">All People</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="card p-4 h-20 animate-pulse bg-muted" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <RotateCcw size={40} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No reimbursements found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => {
              const remaining = Number(r.amount) - Number(r.amount_paid);
              const canPay = r.status === 'pending' || r.status === 'partially_paid';
              return (
                <div key={r.id} className="card p-4 max-[480px]:p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-600 text-foreground">{r.description}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-500 ${STATUS_COLORS[r.status] || 'bg-muted text-muted-foreground'}`}>
                          {STATUS_LABELS[r.status] || r.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.person?.full_name} · {r.owed_by === 'person' ? 'They owe me' : 'I owe them'}
                      </p>
                      <p className="text-xs text-muted-foreground">{r.created_at.slice(0, 10)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <FormattedCurrencyAmount amount={Number(r.amount)} currencyCode={r.currency} className="text-sm font-700 text-foreground" showCode />
                      {Number(r.amount_paid) > 0 && (
                        <div className="text-xs text-positive">
                          Paid: <FormattedCurrencyAmount amount={Number(r.amount_paid)} currencyCode={r.currency} className="inline-flex text-xs text-positive" showCode />
                        </div>
                      )}
                      {canPay && remaining > 0 && (
                        <div className="text-xs text-warning">
                          Remaining: <FormattedCurrencyAmount amount={remaining} currencyCode={r.currency} className="inline-flex text-xs text-warning" showCode />
                        </div>
                      )}
                      {canPay && (
                        <button
                          onClick={() => setPayingReimb(r)}
                          className="mt-2 text-xs px-3 py-1.5 rounded-lg gradient-teal text-white font-600 hover:opacity-90 transition-opacity"
                        >
                          Record Payment
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {payingReimb && (
        <PaymentModal
          reimbursement={payingReimb}
          onClose={() => setPayingReimb(null)}
          onSuccess={loadData}
        />
      )}
    </AppLayout>
  );
}
