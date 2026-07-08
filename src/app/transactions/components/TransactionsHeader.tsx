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
      actionsClassName="w-full sm:w-auto"
      actions={
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-nowrap">
          <button
            onClick={() => {
              if (!onExportCSV) {
                toast?.info(t('transactionsHeader.exportEmpty'));
                return;
              }
              onExportCSV();
            }}
            className="btn-secondary order-2 w-full px-3 py-2.5 text-sm sm:order-1 sm:w-auto sm:flex-none"
          >
            <Download size={15} />
            {t('transactionsHeader.exportCsv')}
          </button>
          <button onClick={onAddTransaction} className="btn-primary order-1 w-full px-3 py-2.5 text-sm sm:order-2 sm:w-auto sm:flex-none">
            <Plus size={15} />
            {t('transactionsHeader.addTransaction')}
          </button>
        </div>
      }
    />
  );
}
