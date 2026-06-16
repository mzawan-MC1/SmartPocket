'use client';
import React from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';

interface AccountsHeaderProps {
  onAddAccount?: () => void;
}

export default function AccountsHeader({ onAddAccount }: AccountsHeaderProps) {
  return (
    <PageHeader
      title="Financial Accounts"
      description="Manage your bank accounts, cards, wallets, and cash in one place."
      badge={<StatusBadge status="info" label="Accounts" />}
      actions={
        <>
          <button
            onClick={() => toast.success('Balances refreshed')}
            className="btn-secondary"
          >
            <RefreshCw size={14} />
            Refresh Balances
          </button>
          <button
            onClick={onAddAccount}
            className="btn-primary"
          >
            <Plus size={15} />
            Add Account
          </button>
        </>
      }
    />
  );
}
