'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { fetchAiTopUpHistory, fetchSubscriptionSummary } from '@/lib/subscription/client';
import { trackMarketingEvent } from '@/lib/analytics';

export default function BillingSuccessPage() {
  const { t } = useTranslation(['portal', 'common']);
  const searchParams = useSearchParams();
  const [loading, setLoading] = React.useState(true);
  const [confirmed, setConfirmed] = React.useState(false);
  const hasTrackedCompletionRef = React.useRef(false);

  const source = searchParams.get('source');
  const isTopUpFlow = source === 'topup';
  const orderId = searchParams.get('orderId');
  const expectedPlanCode = searchParams.get('plan');
  const expectedInterval = searchParams.get('interval');

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      if (isTopUpFlow) {
        const payload = await fetchAiTopUpHistory();
        const matchedOrder = payload?.orders.find((order) => order.id === orderId);
        setConfirmed(Boolean(matchedOrder && matchedOrder.status === 'paid'));
        return;
      }

      const payload = await fetchSubscriptionSummary();
      const summary = payload?.summary;
      const matched = Boolean(
        summary?.hasSubscription
        && summary.planCode === expectedPlanCode
        && summary.billingInterval === expectedInterval
        && (summary.status === 'active' || summary.status === 'trialing')
      );
      setConfirmed(matched);
    } finally {
      setLoading(false);
    }
  }, [expectedInterval, expectedPlanCode, isTopUpFlow, orderId]);

  React.useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 4000);

    return () => window.clearInterval(timer);
  }, [refresh]);

  React.useEffect(() => {
    if (!confirmed || hasTrackedCompletionRef.current) {
      return;
    }

    hasTrackedCompletionRef.current = true;
    trackMarketingEvent(isTopUpFlow ? 'topup_completed' : 'subscription_completed', {
      plan_code: expectedPlanCode || undefined,
      billing_interval: expectedInterval || undefined,
      order_id: orderId || undefined,
    });
  }, [confirmed, expectedInterval, expectedPlanCode, isTopUpFlow, orderId]);

  return (
    <AppLayout activeRoute="/settings">
      <div className="page-section page-shell-readable">
        <PageHeader
          title={t(isTopUpFlow ? 'subscriptionTopUps.paymentSuccessful' : 'subscriptionBilling.paymentSuccessful', { ns: 'portal' })}
          description={t(isTopUpFlow ? 'subscriptionTopUps.paymentSuccessfulDescription' : 'subscriptionBilling.paymentSuccessfulDescription', { ns: 'portal' })}
          badge={<StatusBadge status={confirmed ? 'success' : 'pending'} label={confirmed ? t(isTopUpFlow ? 'subscriptionTopUps.statuses.paid' : 'subscriptionBilling.status.active', { ns: 'portal' }) : t(isTopUpFlow ? 'subscriptionTopUps.waitingForPaymentConfirmation' : 'subscriptionBilling.waitingForPaymentConfirmation', { ns: 'portal' })} />}
        />

        <SectionCard>
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            {confirmed ? (
              <CheckCircle2 size={44} className="text-positive" />
            ) : (
              <Loader2 size={40} className="animate-spin text-accent" />
            )}
            <p className="max-w-xl text-sm text-muted-foreground">
              {confirmed
                ? t(isTopUpFlow ? 'subscriptionTopUps.paymentConfirmedMessage' : 'subscriptionBilling.paymentConfirmedMessage', { ns: 'portal' })
                : t(isTopUpFlow ? 'subscriptionTopUps.waitingForPaymentConfirmation' : 'subscriptionBilling.waitingForPaymentConfirmation', { ns: 'portal' })}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => void refresh()} className="btn-secondary">
                {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                {t('actions.refresh', { ns: 'common' })}
              </button>
              <Link href="/dashboard" className="btn-primary">
                {t('subscriptionBilling.returnToDashboard', { ns: 'portal' })}
              </Link>
              <Link href="/settings/subscription" className="btn-secondary">
                {t(isTopUpFlow ? 'subscriptionTopUps.returnToTopUps' : 'subscriptionBilling.manageSubscription', { ns: 'portal' })}
              </Link>
            </div>
          </div>
        </SectionCard>
      </div>
    </AppLayout>
  );
}
