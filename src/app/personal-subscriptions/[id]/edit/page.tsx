'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import StatusBadge from '@/components/ui/StatusBadge';
import { useLanguage } from '@/contexts/LanguageContext';
import PersonalSubscriptionForm from '../../components/PersonalSubscriptionForm';
import { getAccounts, getCategories, type Category, type FinancialAccount } from '@/lib/finance';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import { getPersonalSubscriptionById } from '@/lib/personal-subscriptions';
import type { PersonalSubscription } from '@/lib/personal-subscriptions-shared';

export default function EditPersonalSubscriptionPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation(['portal', 'common']);
  const { isRTL } = useLanguage();
  const subscriptionId = params.id as string;
  const [subscription, setSubscription] = useState<PersonalSubscription | null>(null);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSubscription, nextAccounts, nextCategories] = await Promise.all([
        getPersonalSubscriptionById(subscriptionId),
        getAccounts(),
        getCategories('expense'),
      ]);
      setSubscription(nextSubscription);
      setAccounts(nextAccounts.filter((account) => account.is_active));
      setCategories(nextCategories);
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
    ['personal_subscriptions', 'financial_accounts', 'categories', 'recurring_transactions'],
    'EditPersonalSubscriptionPage',
    async () => {
      await load();
    }
  );

  if (loading) {
    return (
      <AppLayout activeRoute="/personal-subscriptions">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-56 rounded bg-muted" />
          <div className="section-card">
            <div className="section-card-body h-64 bg-muted/30" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!subscription) {
    return (
      <AppLayout activeRoute="/personal-subscriptions">
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
    <AppLayout activeRoute="/personal-subscriptions">
      <div className="mx-auto max-w-4xl space-y-5 pb-6 max-[640px]:space-y-3.5 max-[640px]:pb-2">
        <div className={`flex items-start gap-3 max-[640px]:gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Link
            href={`/personal-subscriptions/${subscription.id}`}
            className="rounded-xl border border-border p-2 text-muted-foreground transition-colors hover:bg-muted max-[640px]:rounded-lg max-[640px]:p-1.5"
            aria-label={t('personalSubscriptions.actions.backToDetails', { ns: 'portal' })}
          >
            <ArrowLeft size={18} className={`${isRTL ? 'rotate-180' : ''} max-[640px]:size-[17px]`} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 max-[640px]:gap-1.5">
              <h1 className="text-2xl font-800 tracking-[-0.02em] text-foreground max-[640px]:text-[1.3rem] max-[640px]:leading-tight">
                {t('personalSubscriptions.editTitle', { ns: 'portal' })}
              </h1>
              <StatusBadge
                status="pending"
                label={t(`personalSubscriptions.statuses.${subscription.status}`, { ns: 'portal' })}
              />
            </div>
            <p className="mt-1 text-sm text-muted-foreground max-[640px]:mt-0.5 max-[640px]:text-xs max-[640px]:leading-5">
              {subscription.name}
            </p>
          </div>
        </div>

        <div className="section-card">
          <div className="section-card-body max-[640px]:p-4">
            <PersonalSubscriptionForm
              subscription={subscription}
              accounts={accounts}
              categories={categories}
              onSuccess={(savedSubscription) => router.push(`/personal-subscriptions/${savedSubscription.id}`)}
              onCancel={() => router.push(`/personal-subscriptions/${subscription.id}`)}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground max-[640px]:rounded-xl max-[640px]:p-3 max-[640px]:text-xs">
          <div className="flex items-center gap-2 max-[640px]:gap-1.5">
            <Loader2 size={14} className="text-accent max-[640px]:size-[13px]" />
            <span>{t('personalSubscriptions.editHelper', { ns: 'portal' })}</span>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
