import React from 'react';
import AppLayout from '@/components/AppLayout';
import AccountsGrid from './components/AccountsGrid';

export default function FinancialAccountsPage() {
  return (
    <AppLayout activeRoute="/financial-accounts">
      <div className="page-section">
        <AccountsGrid />
      </div>
    </AppLayout>
  );
}
