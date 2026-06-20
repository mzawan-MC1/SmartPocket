'use client';
import React from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';

interface AccountsHeaderProps {
  onAddAccount?: () => void;
}

export default function AccountsHeader({ onAddAccount }: AccountsHeaderProps) {
  const { t } = useTranslation('portal');

  return (
    <PageHeader
      title={t('accounts.title')}
      description={t('accounts.description')}
      badge={<StatusBadge status="info" label={t('accounts.badge')} />}
      compact
      className="max-[480px]:gap-2 [&_.page-subtitle]:max-[480px]:hidden"
      actionsClassName="w-full sm:w-auto"
      actions={
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
          <button
            onClick={() => toast.success(t('accounts.refreshSuccess'))}
            className="btn-secondary flex-1 max-[480px]:hidden sm:flex-none"
          >
            <RefreshCw size={14} />
            {t('accounts.refreshBalances')}
          </button>
          <button
            onClick={onAddAccount}
            className="btn-primary flex-1 sm:flex-none"
          >
            <Plus size={15} />
            {t('accounts.addAccount')}
          </button>
        </div>
      }
    />
  );
}
