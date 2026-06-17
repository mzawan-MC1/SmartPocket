'use client';
import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { DollarSign, Plus } from 'lucide-react';
import {
  getSettlements, createSettlement, getManagedPeople, getReimbursements,
  type Settlement, type ManagedPerson, type Reimbursement
} from '@/lib/people';
import { getAccounts, type FinancialAccount } from '@/lib/finance';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import SearchField from '@/components/ui/SearchField';

interface NewSettlementModalProps {
  people: ManagedPerson[];
  accounts: FinancialAccount[];
  reimbursements: Reimbursement[];
  onClose: () => void;
  onSuccess: () => void;
}

function NewSettlementModal({ people, accounts, reimbursements, onClose, onSuccess }: NewSettlementModalProps) {
  const [personId, setPersonId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('cash');
  const [accountId, setAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedReimbs, setSelectedReimbs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const personReimbs = reimbursements.filter(
    (r) => r.person_id === personId && (r.status === 'pending' || r.status === 'partially_paid')
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personId) { toast.error('Select a person'); return; }
    if (!amount || Number(amount) <= 0) { toast.error('Enter a valid amount'); return; }
    if (!description.trim()) { toast.error('Description is required'); return; }
    setSaving(true);
    try {
      await createSettlement({
        person_id: personId,
        amount: Number(amount),
        currency,
        settlement_date: date,
        payment_method: method,
        receiving_account_id: accountId || null,
        description: description.trim(),
        notes: notes || undefined,
        reimbursement_ids: selectedReimbs.length > 0 ? selectedReimbs : undefined,
      });
      toast.success('Settlement recorded');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to record settlement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-card-md w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-700 text-foreground">New Settlement</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Person <span className="text-negative">*</span></label>
            <select value={personId} onChange={(e) => setPersonId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
              <option value="">Select person...</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Amount <span className="text-negative">*</span></label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" min="0.01" step="0.01"
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
                {['AED', 'USD', 'EUR', 'GBP', 'SAR'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
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
            <label className="block text-sm font-600 text-foreground mb-1.5">Receiving Account (optional)</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
              <option value="">None / External</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Description <span className="text-negative">*</span></label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Final settlement"
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
          </div>

          {personReimbs.length > 0 && (
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Clear Reimbursements (optional)</label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {personReimbs.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-muted">
                    <input type="checkbox" checked={selectedReimbs.includes(r.id)}
                      onChange={(e) => setSelectedReimbs(e.target.checked
                        ? [...selectedReimbs, r.id]
                        : selectedReimbs.filter((id) => id !== r.id))}
                      className="rounded" />
                    <span className="text-sm text-foreground flex-1">{r.description}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.currency} {(Number(r.amount) - Number(r.amount_paid)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Notes</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional"
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow hover:opacity-90 disabled:opacity-60">
              {saving ? 'Saving...' : 'Record Settlement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SettlementsPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [people, setPeople] = useState<ManagedPerson[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPerson, setFilterPerson] = useState('all');
  const [showModal, setShowModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, a, r] = await Promise.all([
        getSettlements(), getManagedPeople(), getAccounts(), getReimbursements(),
      ]);
      setSettlements(s); setPeople(p); setAccounts(a); setReimbursements(r);
    } catch { toast.error('Failed to load settlements'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = settlements.filter((s) => {
    const matchPerson = filterPerson === 'all' || s.person_id === filterPerson;
    const matchSearch = !search || s.description.toLowerCase().includes(search.toLowerCase()) ||
      s.person?.full_name.toLowerCase().includes(search.toLowerCase());
    return matchPerson && matchSearch;
  });

  const totalSettled = settlements.reduce((sum, s) => sum + Number(s.amount), 0);

  return (
    <AppLayout activeRoute="/settlements">
      <div className="page-section pb-6">
        <PageHeader
          title="Settlements"
          description="Record and review settlement payments with linked reimbursements and accounts."
          badge={<StatusBadge status="info" label="Settlements" />}
          actions={
            <button onClick={() => setShowModal(true)} className="btn-primary">
              <Plus size={16} />
              <span>New Settlement</span>
            </button>
          }
        />

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1">Total Settlements</p>
            <p className="text-lg font-700 text-foreground">{settlements.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1">Total Amount</p>
            <p className="text-lg font-700 text-positive">AED {totalSettled.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchField
            type="text"
            placeholder="Search settlements..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            wrapperClassName="flex-1"
            inputClassName="bg-card h-[42px]"
          />
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
            <DollarSign size={40} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No settlements yet</p>
            <button onClick={() => setShowModal(true)} className="mt-4 text-accent text-sm font-600 hover:underline">
              Record first settlement
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((s) => (
              <div key={s.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-600 text-foreground">{s.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.person?.full_name} · {s.payment_method} · {s.settlement_date}
                    </p>
                    {s.receiving_account && (
                      <p className="text-xs text-muted-foreground">To: {s.receiving_account.name}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-700 text-positive">
                      {s.currency} {Number(s.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-positive-soft text-positive font-500">Settled</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <NewSettlementModal
          people={people}
          accounts={accounts}
          reimbursements={reimbursements}
          onClose={() => setShowModal(false)}
          onSuccess={loadData}
        />
      )}
    </AppLayout>
  );
}
