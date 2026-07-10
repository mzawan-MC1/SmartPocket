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
      className="rounded-[24px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] px-3.5 py-3 shadow-card-sm max-[480px]:px-3.5 max-[480px]:py-3"
      actionsClassName="w-full sm:w-auto"
      actions={
        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-row sm:flex-nowrap">
          <button
            onClick={onAddTransaction}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[18px] bg-[linear-gradient(135deg,#0f70f2_0%,#1596ff_100%)] px-3.5 py-2.5 text-[0.94rem] font-700 text-white shadow-[0_12px_22px_rgba(21,112,242,0.16)] transition-transform duration-150 hover:-translate-y-[1px] hover:brightness-105 sm:min-h-11 sm:w-auto sm:flex-none"
          >
            <Plus size={15} />
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
            className="inline-flex min-h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-[18px] border border-[#b8cae6] bg-card px-3.5 py-2.5 text-[0.94rem] font-700 text-[#24467d] shadow-card-sm transition-colors hover:border-[#8fb1de] hover:bg-[#f7fbff] sm:min-h-[2.7rem] sm:w-auto sm:flex-none"
          >
            <Download size={15} />
            {t('transactionsHeader.exportCsv')}
          </button>
        </div>
      }
    />
  );
}
