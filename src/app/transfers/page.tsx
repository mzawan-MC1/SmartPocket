'use client';
import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { ArrowLeftRight, Plus, ChevronRight, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import Modal from '@/components/ui/Modal';
import { toast } from 'sonner';
import EmptyState from '@/components/ui/EmptyState';
import { getTransfers, createTransfer, getAccounts, type Transfer, type FinancialAccount } from '@/lib/finance';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import SearchField from '@/components/ui/SearchField';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';

interface TransferFormData {
  from_account_id: string;
  to_account_id: string;
  amount: string;
  description: string;
  transfer_date: string;
  notes: string;
}

function groupTransferAmounts(transfers: Transfer[]) {
  const grouped = new Map<string, number>();
  for (const transfer of transfers) {
    grouped.set(transfer.currency, (grouped.get(transfer.currency) ?? 0) + Number(transfer.amount));
  }
  return Array.from(grouped.entries()).map(([currency, amount]) => ({ currency, amount }));
}

export default function TransfersPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<TransferFormData>({
    defaultValues: { transfer_date: new Date().toISOString().split('T')[0] },
  });

  const fromAccountId = watch('from_account_id');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getTransfers(), getAccounts()])
      .then(([txfrs, accts]) => {
        setTransfers(txfrs);
        setAccounts(accts.filter((a) => a.is_active));
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const onSubmit = async (data: TransferFormData) => {
    if (data.from_account_id === data.to_account_id) {
      toast.error('From and To accounts must be different');
      return;
    }
    setIsLoading(true);
    try {
      const fromAcct = accounts.find((a) => a.id === data.from_account_id);
      if (!fromAcct?.currency) {
        toast.error('Selected source account is missing a currency');
        return;
      }
      await createTransfer({
        from_account_id: data.from_account_id,
        to_account_id: data.to_account_id,
        amount: parseFloat(data.amount),
        currency: fromAcct.currency,
        description: data.description || 'Transfer',
        transfer_date: data.transfer_date,
        notes: data.notes || undefined,
      });
      toast.success('Transfer completed successfully');
      reset();
      setShowAddModal(false);
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to complete transfer');
    } finally {
      setIsLoading(false);
    }
  };

  const filtered = transfers.filter((t) =>
    !search ||
    (t.from_account?.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.to_account?.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const thisMonthTransfers = transfers.filter((t) => {
    const now = new Date();
    const d = new Date(t.transfer_date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const totalThisMonth = thisMonthTransfers.reduce((s, t) => s + Number(t.amount), 0);
  const avgTransfer = thisMonthTransfers.length > 0 ? totalThisMonth / thisMonthTransfers.length : 0;
  const groupedTransferred = groupTransferAmounts(thisMonthTransfers);

  return (
    <AppLayout activeRoute="/transfers">
      <div className="page-section">
        <PageHeader
          title="Transfers"
          description="Move money between your accounts with a clear view of transfer history."
          badge={<StatusBadge status="info" label="Internal transfers" />}
          actions={
            <button onClick={() => setShowAddModal(true)} className="btn-primary">
              <Plus size={16} /> New Transfer
            </button>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Total Transferred', sub: 'This month', grouped: groupedTransferred },
            { label: 'Transfers Count', value: String(thisMonthTransfers.length), sub: 'This month' },
            { label: 'Avg Transfer', value: groupedTransferred.length === 1 ? avgTransfer : null, currency: groupedTransferred[0]?.currency, sub: groupedTransferred.length === 1 ? 'Per transfer' : 'Unavailable for mixed currencies' },
          ].map((item) => (
            <div key={item.label} className="card-elevated p-4">
              <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1.5">{item.label}</p>
              {'grouped' in item ? (
                <div className="space-y-1">
                  {item.grouped.length === 0 ? <p className="text-sm text-muted-foreground">No transfers</p> : item.grouped.map((row) => (
                    <FormattedCurrencyAmount key={`${item.label}-${row.currency}`} amount={row.amount} currencyCode={row.currency} className="text-lg font-700 text-foreground" />
                  ))}
                </div>
              ) : item.value === null ? (
                <p className="text-sm font-600 text-muted-foreground">Mixed currencies</p>
              ) : item.currency ? (
                <FormattedCurrencyAmount amount={item.value} currencyCode={item.currency} className="text-lg font-700 text-foreground" />
              ) : (
                <p className="text-xl font-700 font-tabular text-foreground">{item.value}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">{item.sub}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="card-elevated p-4">
          <SearchField
            placeholder="Search transfers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            inputClassName="h-10"
          />
        </div>

        {/* Transfers List */}
        <div className="card-elevated overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-base font-700 text-foreground">Transfer History</h2>
          </div>
          {loading ? (
            <div className="divide-y divide-border">
              {[...Array(3)].map((_, i) => (
                <div key={`skel-tr-${i}`} className="flex items-center gap-4 p-4 animate-pulse">
                  <div className="w-10 h-10 rounded-xl bg-muted flex-shrink-0" />
                  <div className="flex-1">
                    <div className="h-3 bg-muted rounded w-48 mb-1.5" />
                    <div className="h-2.5 bg-muted rounded w-32" />
                  </div>
                  <div className="h-4 bg-muted rounded w-20" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12">
              <EmptyState
                icon={ArrowLeftRight}
                title="No transfers yet"
                description="Create your first transfer to move money between accounts."
                action={{ label: 'New Transfer', onClick: () => setShowAddModal(true) }}
              />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((transfer) => (
                <div key={transfer.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-info-soft flex items-center justify-center flex-shrink-0">
                    <ArrowLeftRight size={18} className="text-info" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-600 text-foreground truncate">{transfer.from_account?.name || '—'}</span>
                      <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-600 text-foreground truncate">{transfer.to_account?.name || '—'}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {transfer.description || 'Transfer'} · {transfer.transfer_date}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-700 font-tabular text-foreground">
                      <FormattedCurrencyAmount amount={transfer.amount} currencyCode={transfer.currency} className="text-sm font-700 text-foreground" />
                    </p>
                    <span className="text-[10px] font-600 text-positive bg-positive-soft px-1.5 py-0.5 rounded-full">completed</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Transfer Modal */}
      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); reset(); }} title="New Transfer" size="md">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="from-account" className="block text-sm font-600 text-foreground mb-1.5">From Account *</label>
              <select id="from-account" className={`input-base ${errors.from_account_id ? 'input-error' : ''}`} {...register('from_account_id', { required: 'Select source account' })}>
                <option value="">Select account...</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency} {a.current_balance})</option>)}
              </select>
              {errors.from_account_id && <p className="mt-1.5 text-xs text-negative font-500">{errors.from_account_id.message}</p>}
            </div>
            <div>
              <label htmlFor="to-account" className="block text-sm font-600 text-foreground mb-1.5">To Account *</label>
              <select id="to-account" className={`input-base ${errors.to_account_id ? 'input-error' : ''}`} {...register('to_account_id', { required: 'Select destination account' })}>
                <option value="">Select account...</option>
                {accounts.filter((a) => a.id !== fromAccountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {errors.to_account_id && <p className="mt-1.5 text-xs text-negative font-500">{errors.to_account_id.message}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="transfer-amount" className="block text-sm font-600 text-foreground mb-1.5">Amount *</label>
            <input id="transfer-amount" type="number" step="0.01" min="0.01" className={`input-base font-tabular ${errors.amount ? 'input-error' : ''}`} placeholder="0.00"
              {...register('amount', { required: 'Amount is required', min: { value: 0.01, message: 'Amount must be greater than 0' } })}
            />
            {errors.amount && <p className="mt-1.5 text-xs text-negative font-500">{errors.amount.message}</p>}
          </div>

          <div>
            <label htmlFor="transfer-desc" className="block text-sm font-600 text-foreground mb-1.5">Description</label>
            <input id="transfer-desc" type="text" className="input-base" placeholder="e.g. Monthly savings transfer" {...register('description')} />
          </div>

          <div>
            <label htmlFor="transfer-date" className="block text-sm font-600 text-foreground mb-1.5">Date</label>
            <input id="transfer-date" type="date" className="input-base" {...register('transfer_date')} />
          </div>

          <div>
            <label htmlFor="transfer-notes" className="block text-sm font-600 text-foreground mb-1.5">Notes</label>
            <textarea id="transfer-notes" rows={2} className="input-base resize-none" placeholder="Optional notes..." {...register('notes')} />
          </div>

          <div className="p-3 bg-info-soft/40 rounded-xl border border-info/20">
            <p className="text-xs text-info font-600">This transfer will atomically update both account balances and create linked transaction records.</p>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-border">
            <button type="button" onClick={() => { setShowAddModal(false); reset(); }} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isLoading} className="btn-primary">
              {isLoading ? <><Loader2 size={15} className="animate-spin" /> Processing...</> : 'Complete Transfer'}
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
