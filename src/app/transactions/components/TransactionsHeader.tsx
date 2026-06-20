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
      className="max-[480px]:gap-1.5 [&_.page-title]:max-[480px]:text-[1.45rem] [&_.page-subtitle]:max-[480px]:mt-0.5 [&_.page-subtitle]:max-[480px]:text-[13px] [&_.page-subtitle]:max-[480px]:leading-4"
      actionsClassName="w-full sm:w-auto"
      actions={
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
          <button
            onClick={() => {
              if (!onExportCSV) {
                toast?.info(t('transactionsHeader.exportEmpty'));
                return;
              }
              onExportCSV();
            }}
            className="btn-secondary flex-1 px-3 py-2.5 text-sm max-[360px]:w-full sm:flex-none"
          >
            <Download size={15} />
            {t('transactionsHeader.exportCsv')}
          </button>
          <button onClick={onAddTransaction} className="btn-primary flex-1 px-3 py-2.5 text-sm max-[360px]:w-full sm:flex-none">
            <Plus size={15} />
            {t('transactionsHeader.addTransaction')}
          </button>
        </div>
      }
    />
  );
}
