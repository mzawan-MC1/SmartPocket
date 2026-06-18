'use client';
import React from 'react';
import AppLayout from '@/components/AppLayout';
import TransactionsHeader from './components/TransactionsHeader';
import TransactionsTable from './components/TransactionsTable';

export default function TransactionsPage() {
  const [isAddTransactionOpen, setIsAddTransactionOpen] = React.useState(false);
  const openAddTransaction = React.useCallback(() => {
    setIsAddTransactionOpen(true);
  }, []);
  const closeAddTransaction = React.useCallback(() => {
    setIsAddTransactionOpen(false);
  }, []);

  return (
    <AppLayout activeRoute="/transactions">
      <div className="page-section">
        <TransactionsHeader onAddTransaction={openAddTransaction} />
        <TransactionsTable
          isAddTransactionOpen={isAddTransactionOpen}
          onOpenAddTransaction={openAddTransaction}
          onCloseAddTransaction={closeAddTransaction}
        />
      </div>
    </AppLayout>
  );
}
