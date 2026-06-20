'use client';
import React from 'react';
import { Plus, Download } from 'lucide-react';
import { toast } from 'sonner';
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
  return (
    <PageHeader
      title="Transactions"
      description={`Review, filter, and manage income, expenses, and transfers from a single ledger. Active range: ${activeRangeLabel}`}
      badge={<StatusBadge status="info" label="Finance ledger" />}
      compact
      className="max-[480px]:gap-1.5 [&_.page-title]:max-[480px]:text-[1.45rem] [&_.page-subtitle]:max-[480px]:mt-0.5 [&_.page-subtitle]:max-[480px]:text-[13px] [&_.page-subtitle]:max-[480px]:leading-4"
      actionsClassName="w-full sm:w-auto"
      actions={
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
          <button
            onClick={() => {
              if (!onExportCSV) {
                toast?.info('No filtered transactions are ready to export yet');
                return;
              }
              onExportCSV();
            }}
            className="btn-secondary flex-1 px-3 py-2.5 text-sm max-[360px]:w-full sm:flex-none"
          >
            <Download size={15} />
            Export CSV
          </button>
          <button onClick={onAddTransaction} className="btn-primary flex-1 px-3 py-2.5 text-sm max-[360px]:w-full sm:flex-none">
            <Plus size={15} />
            Add Transaction
          </button>
        </div>
      }
    />
  );
}
