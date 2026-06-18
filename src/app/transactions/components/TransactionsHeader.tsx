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
      actions={
        <>
          <button
            onClick={() => {
              if (!onExportCSV) {
                toast?.info('No filtered transactions are ready to export yet');
                return;
              }
              onExportCSV();
            }}
            className="btn-secondary"
          >
            <Download size={15} />
            Export CSV
          </button>
          <button onClick={onAddTransaction} className="btn-primary">
            <Plus size={15} />
            Add Transaction
          </button>
        </>
      }
    />
  );
}
