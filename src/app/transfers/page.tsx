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
    <AppLayout activeRoute="/transfers" hideMobileFooter>
      <div className="page-section max-[480px]:gap-2.5">
        <PageHeader
          title={t('transfers.title')}
          description={t('transfers.description')}
          badge={<StatusBadge status="info" label={t('transfers.badge')} />}
          compact
          className="rounded-[24px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] px-3.5 py-3 shadow-card-sm max-[480px]:px-3.5 max-[480px]:py-3"
          actions={
            <button onClick={() => setShowAddModal(true)} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[18px] bg-[linear-gradient(135deg,#06a6d8_0%,#1294ff_100%)] px-3.5 py-2.5 text-[14px] font-700 text-white shadow-[0_12px_24px_rgba(18,148,255,0.18)] transition-transform duration-150 hover:-translate-y-[1px] hover:brightness-105 sm:w-auto">
              <Plus size={16} /> {t('transfers.newTransfer')}
            </button>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-2.5 min-[430px]:grid-cols-3">
          {loading ? Array.from({ length: 3 }).map((_, index) => (
            <SectionCardSkeleton key={`transfer-summary-skeleton-${index + 1}`} lines={2} className="h-full" />
          )) : [
            { label: t('transfers.summary.totalTransferred'), sub: t('transfers.thisMonth'), grouped: groupedTransferred },
            { label: t('transfers.summary.count'), value: String(thisMonthTransfers.length), sub: t('transfers.thisMonth') },
            { label: t('transfers.summary.average'), value: groupedTransferred.length === 1 ? avgTransfer : null, currency: groupedTransferred[0]?.currency, sub: groupedTransferred.length === 1 ? t('transfers.perTransfer') : t('transfers.unavailableMixedCurrencies') },
          ].map((item) => (
            <div key={item.label} className={`card-elevated rounded-[20px] border border-border/80 p-3 shadow-card-sm ${item.label === t('transfers.summary.totalTransferred') ? 'col-span-2 min-[430px]:col-span-1' : ''}`}>
              <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1.5">{item.label}</p>
              {item.label === t('transfers.summary.totalTransferred') ? (
                <div className="space-y-1">
                  {groupedTransferred.length === 0 ? <p className="text-[13px] text-muted-foreground">{t('transfers.noTransfers')}</p> : groupedTransferred.map((row) => (
                    <FormattedCurrencyAmount key={`${item.label}-${row.currency}`} amount={row.amount} currencyCode={row.currency} className="text-[16px] font-800 text-foreground" />
                  ))}
                </div>
              ) : item.value === null ? (
                <p className="text-[13px] font-600 text-muted-foreground">{t('transfers.mixedCurrencies')}</p>
              ) : item.currency ? (
                <FormattedCurrencyAmount amount={item.value} currencyCode={item.currency} className="text-[16px] font-800 text-foreground" />
              ) : (
                <p className="text-[16px] font-800 font-tabular text-foreground">{item.value}</p>
              )}
              <p className="mt-1 text-[10.5px] text-muted-foreground">{item.sub}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="card-elevated rounded-[20px] border border-border/80 p-3 max-[480px]:p-2.5">
          <SearchField
            placeholder={t('transfers.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            inputClassName="h-11 rounded-[18px] px-3.5"
          />
        </div>

        {/* Transfers List */}
        <div className="card-elevated overflow-hidden rounded-[22px] border border-border/80">
          <div className="border-b border-border px-3.5 py-3 max-[480px]:px-3 max-[480px]:py-2.5">
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
                <div key={transfer.id} className="flex items-start gap-3 p-3 transition-colors hover:bg-muted/30 max-[480px]:gap-2.5 max-[480px]:p-2.5">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-info-soft">
                    <ArrowLeftRight size={16} className="text-info" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 max-[480px]:flex-wrap">
                      <span className="truncate text-[13px] font-700 text-foreground">{transfer.from_account?.name || t('transfers.notAvailable')}</span>
                      <ChevronRight size={13} className="flex-shrink-0 text-muted-foreground" />
                      <span className="truncate text-[13px] font-700 text-foreground">{transfer.to_account?.name || t('transfers.notAvailable')}</span>
                    </div>
                    <p className="mt-0.5 break-words text-[11px] text-muted-foreground">
                      {transfer.description || t('transfers.transferFallback')} · {transfer.transfer_date}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    <p className="text-[13px] font-800 font-tabular text-foreground">
                      <FormattedCurrencyAmount
                        amount={transfer.source_amount ?? transfer.amount}
                        currencyCode={transfer.source_currency || transfer.currency}
                        className="text-[13px] font-800 text-foreground"
                      />
                    </p>
                    {transfer.destination_currency && transfer.destination_currency !== (transfer.source_currency || transfer.currency) ? (
                      <p className="text-[10.5px] text-muted-foreground">
                        <FormattedCurrencyAmount
                          amount={transfer.destination_amount ?? transfer.amount}
                          currencyCode={transfer.destination_currency}
                          className="text-[10.5px] text-muted-foreground"
                        />
                      </p>
                    ) : null}
                    <span className="rounded-full bg-positive-soft px-2 py-0.5 text-[10px] font-700 text-positive">{t('transfers.completed')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Transfer Modal */}
      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); }} title={t('transfers.newTransfer')} size="md" mobileLayout="sheet" contentClassName="max-[480px]:w-[min(calc(100vw-8px),430px)]" headerClassName="max-[480px]:px-3.5 max-[480px]:py-2.5" bodyClassName="overflow-hidden p-0">
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
