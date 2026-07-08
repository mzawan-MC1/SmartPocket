'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
import { ListItemSkeleton, SectionCardSkeleton } from '@/components/ui/LoadingSkeleton';

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
  const { t } = useTranslation('portal');
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
          title={t('transfers.title')}
          description={t('transfers.description')}
          badge={<StatusBadge status="info" label={t('transfers.badge')} />}
          compact
          hideDescriptionOnMobile
          actions={
            <button onClick={() => setShowAddModal(true)} className="btn-primary max-[480px]:w-full">
              <Plus size={16} /> {t('transfers.newTransfer')}
            </button>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-3">
          {loading ? Array.from({ length: 3 }).map((_, index) => (
            <SectionCardSkeleton key={`transfer-summary-skeleton-${index + 1}`} lines={2} className="h-full" />
          )) : [
            { label: t('transfers.summary.totalTransferred'), sub: t('transfers.thisMonth'), grouped: groupedTransferred },
            { label: t('transfers.summary.count'), value: String(thisMonthTransfers.length), sub: t('transfers.thisMonth') },
            { label: t('transfers.summary.average'), value: groupedTransferred.length === 1 ? avgTransfer : null, currency: groupedTransferred[0]?.currency, sub: groupedTransferred.length === 1 ? t('transfers.perTransfer') : t('transfers.unavailableMixedCurrencies') },
          ].map((item) => (
            <div key={item.label} className="card-elevated p-4 max-[480px]:p-3">
              <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1.5">{item.label}</p>
              {item.label === t('transfers.summary.totalTransferred') ? (
                <div className="space-y-1">
                  {groupedTransferred.length === 0 ? <p className="text-sm text-muted-foreground">{t('transfers.noTransfers')}</p> : groupedTransferred.map((row) => (
                    <FormattedCurrencyAmount key={`${item.label}-${row.currency}`} amount={row.amount} currencyCode={row.currency} className="text-lg font-700 text-foreground" />
                  ))}
                </div>
              ) : item.value === null ? (
                <p className="text-sm font-600 text-muted-foreground">{t('transfers.mixedCurrencies')}</p>
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
            placeholder={t('transfers.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            inputClassName="h-10"
          />
        </div>

        {/* Transfers List */}
        <div className="card-elevated overflow-hidden">
          <div className="border-b border-border p-4 max-[480px]:px-3 max-[480px]:py-3">
            <h2 className="text-base font-700 text-foreground">{t('transfers.history')}</h2>
          </div>
          {loading ? (
            <ListItemSkeleton count={4} />
          ) : filtered.length === 0 ? (
            <div className="p-12">
              <EmptyState
                icon={ArrowLeftRight}
                title={t('transfers.emptyTitle')}
                description={t('transfers.emptyDescription')}
                action={{ label: t('transfers.newTransfer'), onClick: () => setShowAddModal(true) }}
              />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((transfer) => (
                <div key={transfer.id} className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/30 max-[520px]:flex-col max-[520px]:items-stretch max-[480px]:gap-3 max-[480px]:p-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-info-soft max-[480px]:h-9 max-[480px]:w-9">
                    <ArrowLeftRight size={18} className="text-info" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 max-[480px]:flex-wrap">
                      <span className="text-sm font-600 text-foreground truncate">{transfer.from_account?.name || t('transfers.notAvailable')}</span>
                      <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-600 text-foreground truncate">{transfer.to_account?.name || t('transfers.notAvailable')}</span>
                    </div>
                    <p className="mt-0.5 break-words text-xs text-muted-foreground">
                      {transfer.description || t('transfers.transferFallback')} · {transfer.transfer_date}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right max-[520px]:flex max-[520px]:items-start max-[520px]:justify-between max-[520px]:gap-3 max-[520px]:text-left">
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
                    <span className="rounded-full bg-positive-soft px-1.5 py-0.5 text-[10px] font-600 text-positive max-[520px]:self-start">{t('transfers.completed')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Transfer Modal */}
      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); }} title={t('transfers.newTransfer')} size="md">
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
