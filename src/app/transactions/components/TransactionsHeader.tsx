'use client';
import React from 'react';
import { Plus, Download } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';

export default function TransactionsHeader() {
  return (
    <PageHeader
      title="Transactions"
      description="Review, filter, and manage income, expenses, and transfers from a single ledger."
      badge={<StatusBadge status="info" label="Finance ledger" />}
      actions={
        <>
          <button
            onClick={() => toast?.info('CSV export triggered')}
            className="btn-secondary"
          >
            <Download size={15} />
            Export CSV
          </button>
          <button className="btn-primary">
            <Plus size={15} />
            Add Transaction
          </button>
        </>
      }
    />
  );
}
