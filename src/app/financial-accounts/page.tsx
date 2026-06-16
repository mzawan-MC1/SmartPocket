import React from 'react';
import AppLayout from '@/components/AppLayout';
import AccountsHeader from './components/AccountsHeader';
import AccountsGrid from './components/AccountsGrid';

export default function FinancialAccountsPage() {
  return (
    <AppLayout activeRoute="/financial-accounts">
      <div className="page-section">
        <AccountsHeader />
        <AccountsGrid />
      </div>
    </AppLayout>
  );
}
