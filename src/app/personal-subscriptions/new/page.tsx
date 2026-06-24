'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CreditCard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AppLayout from '@/components/AppLayout';
import StatusBadge from '@/components/ui/StatusBadge';
import PersonalSubscriptionForm from '../components/PersonalSubscriptionForm';

export default function NewPersonalSubscriptionPage() {
  const router = useRouter();
  const { t } = useTranslation(['portal', 'common']);

  return (
    <AppLayout activeRoute="/personal-subscriptions">
      <div className="mx-auto max-w-4xl space-y-5 pb-6">
        <div className="flex items-start gap-3">
          <Link
            href="/personal-subscriptions"
            className="rounded-xl border border-border p-2 text-muted-foreground transition-colors hover:bg-muted"
            aria-label={t('personalSubscriptions.actions.backToSubscriptions', { ns: 'portal' })}
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-800 tracking-[-0.02em] text-foreground">
                {t('personalSubscriptions.newTitle', { ns: 'portal' })}
              </h1>
              <StatusBadge
                status="info"
                label={t('personalSubscriptions.badge', { ns: 'portal' })}
              />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('personalSubscriptions.newDescription', { ns: 'portal' })}
            </p>
          </div>
        </div>

        <div className="section-card">
          <div className="section-card-header">
            <div>
              <h2 className="section-title">
                {t('personalSubscriptions.formTitle', { ns: 'portal' })}
              </h2>
              <p className="section-description">
                {t('personalSubscriptions.formDescription', { ns: 'portal' })}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <CreditCard size={18} />
            </div>
          </div>
          <div className="section-card-body">
            <PersonalSubscriptionForm
              onSuccess={(subscription) => router.push(`/personal-subscriptions/${subscription.id}`)}
              onCancel={() => router.push('/personal-subscriptions')}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
