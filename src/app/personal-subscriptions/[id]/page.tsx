'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CalendarClock,
  Loader2,
  Pause,
  Play,
  ReceiptText,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import { useLanguage } from '@/contexts/LanguageContext';
import { dispatchSmartPocketDataChanged, useSmartPocketDataChanged } from '@/lib/data-change';
import {
  deletePersonalSubscription,
  getPersonalSubscriptionById,
  markPersonalSubscriptionCancelled,
  markPersonalSubscriptionPaid,
  requestPersonalSubscriptionCancellation,
  updatePersonalSubscription,
} from '@/lib/personal-subscriptions';
import {
  canMarkPersonalSubscriptionCancelled,
  canPauseOrResumePersonalSubscription,
  canRequestPersonalSubscriptionCancellation,
  type PersonalSubscription,
} from '@/lib/personal-subscriptions-shared';
import CancellationRequestModal from '../components/CancellationRequestModal';
import PersonalSubscriptionDetailsContent from '../components/PersonalSubscriptionDetailsContent';

function normalizeTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function PersonalSubscriptionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation(['portal', 'common']);
  const { isRTL } = useLanguage();
  const subscriptionId = params.id as string;
  const todayIso = normalizeTodayIso();
  const [subscription, setSubscription] = useState<PersonalSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showCancellationModal, setShowCancellationModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSubscription(await getPersonalSubscriptionById(subscriptionId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('personalSubscriptions.loadFailed', { ns: 'portal' }));
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, [subscriptionId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPocketDataChanged(
    ['personal_subscriptions', 'transactions', 'financial_accounts', 'recurring_transactions', 'notifications'],
    'PersonalSubscriptionDetailPage',
    async () => {
      await load();
    }
  );

  const notifyChange = useCallback((entities: Array<
    'personal_subscriptions' | 'dashboard' | 'transactions' | 'financial_accounts' | 'recurring_transactions' | 'notifications'
  >) => {
    dispatchSmartPocketDataChanged({
      source: 'personal-subscription-detail',
      entities,
    });
  }, []);

  const handlePauseToggle = async () => {
    if (!subscription) return;
    setProcessingId(subscription.id);
    try {
      await updatePersonalSubscription(subscription.id, {
        status: subscription.status === 'paused' ? 'active' : 'paused',
      });
      notifyChange(['personal_subscriptions', 'dashboard', 'recurring_transactions', 'notifications']);
      toast.success(
        subscription.status === 'paused'
          ? t('personalSubscriptions.actions.resumedSuccess', { ns: 'portal', name: subscription.name })
          : t('personalSubscriptions.actions.pausedSuccess', { ns: 'portal', name: subscription.name })
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('personalSubscriptions.actions.updateFailed', { ns: 'portal' }));
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkPaid = async () => {
    if (!subscription) return;
    setProcessingId(subscription.id);
    try {
      await markPersonalSubscriptionPaid(subscription.id);
      notifyChange(['personal_subscriptions', 'dashboard', 'transactions', 'financial_accounts', 'recurring_transactions', 'notifications']);
      toast.success(t('personalSubscriptions.actions.markedPaidSuccess', { ns: 'portal', name: subscription.name }));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('personalSubscriptions.actions.markPaidFailed', { ns: 'portal' }));
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkCancelled = async () => {
    if (!subscription) return;
    if (!window.confirm(t('personalSubscriptions.actions.confirmMarkCancelled', { ns: 'portal', name: subscription.name }))) {
      return;
    }

    setProcessingId(subscription.id);
    try {
      await markPersonalSubscriptionCancelled(subscription.id);
      notifyChange(['personal_subscriptions', 'dashboard', 'recurring_transactions', 'notifications']);
      toast.success(t('personalSubscriptions.actions.cancelledSuccess', { ns: 'portal', name: subscription.name }));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('personalSubscriptions.actions.cancelFailed', { ns: 'portal' }));
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async () => {
    if (!subscription) return;
    if (!window.confirm(t('personalSubscriptions.actions.confirmDelete', { ns: 'portal', name: subscription.name }))) {
      return;
    }

    setProcessingId(subscription.id);
    try {
      await deletePersonalSubscription(subscription.id);
      notifyChange(['personal_subscriptions', 'dashboard', 'recurring_transactions', 'notifications']);
      toast.success(t('personalSubscriptions.actions.deletedSuccess', { ns: 'portal', name: subscription.name }));
      router.push('/personal-subscriptions');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('personalSubscriptions.actions.deleteFailed', { ns: 'portal' }));
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <AppLayout activeRoute="/personal-subscriptions" hideMobileFooter>
        <div className="mx-auto max-w-3xl space-y-3 animate-pulse">
          <div className="h-8 w-56 rounded bg-muted" />
          <div className="rounded-[20px] border border-border bg-card p-4">
            <div className="h-28 rounded bg-muted/30" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!subscription) {
    return (
      <AppLayout activeRoute="/personal-subscriptions" hideMobileFooter>
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {t('personalSubscriptions.notFoundDescription', { ns: 'portal' })}
          </p>
          <Link href="/personal-subscriptions" className="mt-3 inline-flex text-sm font-700 text-accent hover:text-teal-600">
            {t('personalSubscriptions.actions.backToSubscriptions', { ns: 'portal' })}
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout activeRoute="/personal-subscriptions" hideMobileFooter>
      <div className="mx-auto max-w-3xl space-y-3 max-[480px]:space-y-2.5">
        <div className={`flex items-start gap-2.5 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Link
            href="/personal-subscriptions"
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted"
            aria-label={t('personalSubscriptions.actions.backToSubscriptions', { ns: 'portal' })}
          >
            <ArrowLeft size={17} className={isRTL ? 'rotate-180' : ''} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.4rem] font-800 tracking-[-0.02em] text-foreground max-[480px]:text-[1.2rem]">
              {subscription.name}
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {t('personalSubscriptions.detail.subtitle', {
                ns: 'portal',
                amount: subscription.amount.toFixed(2),
                currency: subscription.currency_code,
              })}
            </p>
          </div>
        </div>

        <PersonalSubscriptionDetailsContent
          subscription={subscription}
          todayIso={todayIso}
          actions={(
            <>
              <Link href={`/personal-subscriptions/${subscription.id}/edit`} className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-card px-3 text-[13px] font-700 text-foreground">
                {t('actions.edit', { ns: 'common' })}
              </Link>
              {canPauseOrResumePersonalSubscription(subscription.status) ? (
                <button
                  type="button"
                  onClick={() => void handlePauseToggle()}
                  disabled={processingId === subscription.id}
                  className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl border border-border bg-card px-3 text-[13px] font-700 text-foreground"
                >
                  {processingId === subscription.id ? <Loader2 size={13} className="animate-spin" /> : subscription.status === 'paused' ? <Play size={13} /> : <Pause size={13} />}
                  {subscription.status === 'paused'
                    ? t('personalSubscriptions.actions.resume', { ns: 'portal' })
                    : t('personalSubscriptions.actions.pause', { ns: 'portal' })}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handleMarkPaid()}
                disabled={processingId === subscription.id || !subscription.financial_account_id}
                className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl border border-border bg-card px-3 text-[13px] font-700 text-foreground"
              >
                {processingId === subscription.id ? <Loader2 size={13} className="animate-spin" /> : <ReceiptText size={13} />}
                {t('personalSubscriptions.actions.markPaid', { ns: 'portal' })}
              </button>
              {canRequestPersonalSubscriptionCancellation(subscription.status) ? (
                <button
                  type="button"
                  onClick={() => setShowCancellationModal(true)}
                  disabled={processingId === subscription.id}
                  className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl border border-border bg-card px-3 text-[13px] font-700 text-foreground"
                >
                  <CalendarClock size={13} />
                  {t('personalSubscriptions.actions.requestCancellation', { ns: 'portal' })}
                </button>
              ) : null}
              {canMarkPersonalSubscriptionCancelled(subscription.status) ? (
                <button
                  type="button"
                  onClick={() => void handleMarkCancelled()}
                  disabled={processingId === subscription.id}
                  className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl border border-border bg-card px-3 text-[13px] font-700 text-foreground"
                >
                  <XCircle size={13} />
                  {t('personalSubscriptions.actions.markCancelled', { ns: 'portal' })}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={processingId === subscription.id}
                className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl border border-border bg-card px-3 text-[13px] font-700 text-negative"
              >
                <Trash2 size={13} />
                {t('common:actions.delete')}
              </button>
            </>
          )}
        />
      </div>

      <CancellationRequestModal
        isOpen={showCancellationModal}
        onClose={() => setShowCancellationModal(false)}
        title={t('personalSubscriptions.cancellation.modalTitle', {
          ns: 'portal',
          name: subscription.name,
        })}
        defaultValues={{
          effective_cancellation_date: subscription.cancel_effective_date || subscription.next_billing_date || '',
          confirmation_reference: subscription.cancel_confirmation_reference || '',
        }}
        onSubmit={async (values) => {
          setProcessingId(subscription.id);
          try {
            await requestPersonalSubscriptionCancellation(subscription.id, values);
            notifyChange(['personal_subscriptions', 'dashboard', 'recurring_transactions', 'notifications']);
            toast.success(t('personalSubscriptions.cancellation.requestedSuccess', { ns: 'portal', name: subscription.name }));
            await load();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : t('personalSubscriptions.cancellation.requestFailed', { ns: 'portal' }));
            throw error;
          } finally {
            setProcessingId(null);
          }
        }}
      />
    </AppLayout>
  );
}
