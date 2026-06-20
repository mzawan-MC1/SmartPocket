'use client';
import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { ArrowLeftRight, Plus, ChevronRight } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { toast } from 'sonner';
import EmptyState from '@/components/ui/EmptyState';
import { getTransfers, getAccounts, type Transfer, type FinancialAccount } from '@/lib/finance';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import SearchField from '@/components/ui/SearchField';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import AddTransferForm from '@/app/transfers/components/AddTransferForm';

function groupTransferAmounts(transfers: Transfer[]) {
  const grouped = new Map<string, number>();
  for (const transfer of transfers) {
    const currency = transfer.source_currency || transfer.currency;
    const amount = Number(transfer.source_amount ?? transfer.amount);
    grouped.set(currency, (grouped.get(currency) ?? 0) + amount);
  }
  return Array.from(grouped.entries()).map(([currency, amount]) => ({ currency, amount }));
}

export default function TransfersPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);

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

  useSmartPocketDataChanged(['transfers', 'transactions', 'financial_accounts'], 'TransfersPage', async () => {
    load();
  });

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
      <div className="page-section max-[480px]:gap-3">
        <PageHeader
          title="Transfers"
          description="Move money between your accounts with a clear view of transfer history."
          badge={<StatusBadge status="info" label="Internal transfers" />}
          compact
          className="max-[480px]:gap-2 [&_.page-subtitle]:max-[480px]:hidden"
          actions={
            <button onClick={() => setShowAddModal(true)} className="btn-primary max-[480px]:w-full">
              <Plus size={16} /> New Transfer
            </button>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-3">
          {[
            { label: 'Total Transferred', sub: 'This month', grouped: groupedTransferred },
            { label: 'Transfers Count', value: String(thisMonthTransfers.length), sub: 'This month' },
            { label: 'Avg Transfer', value: groupedTransferred.length === 1 ? avgTransfer : null, currency: groupedTransferred[0]?.currency, sub: groupedTransferred.length === 1 ? 'Per transfer' : 'Unavailable for mixed currencies' },
          ].map((item) => (
            <div key={item.label} className="card-elevated p-4 max-[480px]:p-3">
              <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1.5">{item.label}</p>
              {item.label === 'Total Transferred' ? (
                <div className="space-y-1">
                  {groupedTransferred.length === 0 ? <p className="text-sm text-muted-foreground">No transfers</p> : groupedTransferred.map((row) => (
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
        <div className="card-elevated p-4 max-[480px]:p-3">
          <SearchField
            placeholder="Search transfers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            inputClassName="h-10"
          />
        </div>

        {/* Transfers List */}
        <div className="card-elevated overflow-hidden">
          <div className="border-b border-border p-4 max-[480px]:px-3 max-[480px]:py-3">
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
                <div key={transfer.id} className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/30 max-[480px]:items-start max-[480px]:gap-3 max-[480px]:p-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-info-soft max-[480px]:h-9 max-[480px]:w-9">
                    <ArrowLeftRight size={18} className="text-info" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 max-[480px]:flex-wrap">
                      <span className="text-sm font-600 text-foreground truncate">{transfer.from_account?.name || '—'}</span>
                      <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-600 text-foreground truncate">{transfer.to_account?.name || '—'}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {transfer.description || 'Transfer'} · {transfer.transfer_date}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-sm font-700 font-tabular text-foreground">
                      <FormattedCurrencyAmount
                        amount={transfer.source_amount ?? transfer.amount}
                        currencyCode={transfer.source_currency || transfer.currency}
                        className="text-sm font-700 text-foreground"
                      />
                    </p>
                    {transfer.destination_currency && transfer.destination_currency !== (transfer.source_currency || transfer.currency) ? (
                      <p className="text-[11px] text-muted-foreground">
                        <FormattedCurrencyAmount
                          amount={transfer.destination_amount ?? transfer.amount}
                          currencyCode={transfer.destination_currency}
                          className="text-[11px] text-muted-foreground"
                        />
                      </p>
                    ) : null}
                    <span className="rounded-full bg-positive-soft px-1.5 py-0.5 text-[10px] font-600 text-positive">completed</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Transfer Modal */}
      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); }} title="New Transfer" size="md">
        <AddTransferForm
          accounts={accounts}
          onSuccess={() => {
            setShowAddModal(false);
          }}
          onCancel={() => setShowAddModal(false)}
        />
      </Modal>
    </AppLayout>
  );
}
