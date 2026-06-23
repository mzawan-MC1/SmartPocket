'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { XCircle } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import StatusBadge from '@/components/ui/StatusBadge';

export default function BillingCancelPage() {
  const { t } = useTranslation('portal');

  return (
    <AppLayout activeRoute="/settings">
      <div className="page-section page-shell-readable">
        <PageHeader
          title={t('subscriptionBilling.checkoutCancelled')}
          description={t('subscriptionBilling.checkoutCancelledDescription')}
          badge={<StatusBadge status="warning" label={t('subscriptionBilling.checkoutCancelled')} />}
        />

        <SectionCard>
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <XCircle size={44} className="text-warning" />
            <p className="max-w-xl text-sm text-muted-foreground">
              {t('subscriptionBilling.checkoutCancelledExplanation')}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/settings/subscription" className="btn-primary">
                {t('subscriptionBilling.returnToSubscription')}
              </Link>
              <Link href="/dashboard" className="btn-secondary">
                {t('subscriptionBilling.returnToDashboard')}
              </Link>
            </div>
          </div>
        </SectionCard>
      </div>
    </AppLayout>
  );
}
