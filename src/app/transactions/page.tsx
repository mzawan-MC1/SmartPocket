import React from 'react';
import AppLayout from '@/components/AppLayout';
import TransactionsHeader from './components/TransactionsHeader';
import TransactionsTable from './components/TransactionsTable';

export default function TransactionsPage() {
  return (
    <AppLayout activeRoute="/transactions">
      <div className="page-section">
        <TransactionsHeader />
        <TransactionsTable />
      </div>
    </AppLayout>
  );
}
