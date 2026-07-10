'use client';
import React from 'react';
import { Plus, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';

export default function TransactionsHeader({
  onAddTransaction,
  onExportCSV,
  activeRangeLabel,
}: {
  onAddTransaction: () => void;
  onExportCSV: (() => void) | null;
  activeRangeLabel: string;
}) {
  const { t } = useTranslation('portal');
  return (
    <PageHeader
      title={t('transactionsHeader.title')}
      description={t('transactionsHeader.description', { range: activeRangeLabel })}
      badge={<StatusBadge status="info" label={t('transactionsHeader.badge')} />}
      compact
      className="rounded-[28px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] px-4 py-4 shadow-card-sm max-[480px]:px-4 max-[480px]:py-4"
      actionsClassName="w-full sm:w-auto"
      actions={
        <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-nowrap">
          <button
            onClick={onAddTransaction}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#0f70f2_0%,#1596ff_100%)] px-4 py-3 text-sm font-700 text-white shadow-[0_14px_28px_rgba(21,112,242,0.18)] transition-transform duration-150 hover:-translate-y-[1px] hover:brightness-105 sm:min-h-11 sm:w-auto sm:flex-none"
          >
            <Plus size={16} />
            {t('transactionsHeader.addTransaction')}
          </button>
          <button
            onClick={() => {
              if (!onExportCSV) {
                toast?.info(t('transactionsHeader.exportEmpty'));
                return;
              }
              onExportCSV();
            }}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#b8cae6] bg-card px-4 py-3 text-sm font-700 text-[#24467d] shadow-card-sm transition-colors hover:border-[#8fb1de] hover:bg-[#f7fbff] sm:min-h-11 sm:w-auto sm:flex-none"
          >
            <Download size={16} />
            {t('transactionsHeader.exportCsv')}
          </button>
        </div>
      }
    />
  );
}
