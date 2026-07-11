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
      className="rounded-[24px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] px-3.5 py-3 shadow-card-sm max-[480px]:px-3.5 max-[480px]:py-3"
      actionsClassName="w-full sm:w-auto"
      actions={
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-nowrap">
          <button
            onClick={() => toast.success(t('accounts.refreshSuccess'))}
            className="btn-secondary flex-1 max-[480px]:hidden sm:flex-none"
          >
            <RefreshCw size={14} />
            {t('accounts.refreshBalances')}
          </button>
          <button
            onClick={onAddAccount}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[18px] bg-[linear-gradient(135deg,#06a6d8_0%,#1294ff_100%)] px-3.5 py-2.5 text-[14px] font-700 text-white shadow-[0_12px_24px_rgba(18,148,255,0.18)] transition-transform duration-150 hover:-translate-y-[1px] hover:brightness-105 sm:flex-none"
          >
            <Plus size={15} />
            {t('accounts.addAccount')}
          </button>
        </div>
      }
    />
  );
}
