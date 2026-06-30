'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CreditCard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AppLayout from '@/components/AppLayout';
import StatusBadge from '@/components/ui/StatusBadge';
import { useLanguage } from '@/contexts/LanguageContext';
import PersonalSubscriptionForm from '../components/PersonalSubscriptionForm';

export default function NewPersonalSubscriptionPage() {
  const router = useRouter();
  const { t } = useTranslation(['portal', 'common']);
  const { isRTL } = useLanguage();

  return (
    <AppLayout activeRoute="/personal-subscriptions">
      <div className="mx-auto max-w-4xl space-y-5 pb-6 max-[640px]:space-y-3.5 max-[640px]:pb-2">
        <div className={`flex items-start gap-3 max-[640px]:gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Link
            href="/personal-subscriptions"
            className="rounded-xl border border-border p-2 text-muted-foreground transition-colors hover:bg-muted max-[640px]:rounded-lg max-[640px]:p-1.5"
            aria-label={t('personalSubscriptions.actions.backToSubscriptions', { ns: 'portal' })}
          >
            <ArrowLeft size={18} className={`${isRTL ? 'rotate-180' : ''} max-[640px]:size-[17px]`} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 max-[640px]:gap-1.5">
              <h1 className="text-2xl font-800 tracking-[-0.02em] text-foreground max-[640px]:text-[1.3rem] max-[640px]:leading-tight">
                {t('personalSubscriptions.newTitle', { ns: 'portal' })}
              </h1>
              <StatusBadge
                status="info"
                label={t('personalSubscriptions.badge', { ns: 'portal' })}
              />
            </div>
            <p className="mt-1 text-sm text-muted-foreground max-[640px]:mt-0.5 max-[640px]:text-xs max-[640px]:leading-5">
              {t('personalSubscriptions.newDescription', { ns: 'portal' })}
            </p>
          </div>
        </div>

        <div className="section-card">
          <div className="section-card-header max-[640px]:items-center max-[640px]:gap-3 max-[640px]:px-4 max-[640px]:pt-4">
            <div className="min-w-0 flex-1">
              <h2 className="section-title max-[640px]:text-[0.95rem] max-[640px]:leading-5">
                {t('personalSubscriptions.formTitle', { ns: 'portal' })}
              </h2>
              <p className="section-description max-[640px]:mt-0.5 max-[640px]:text-xs max-[640px]:leading-5">
                {t('personalSubscriptions.formDescription', { ns: 'portal' })}
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent max-[640px]:h-9 max-[640px]:w-9 max-[640px]:rounded-xl">
              <CreditCard size={18} className="max-[640px]:size-4" />
            </div>
          </div>
          <div className="section-card-body max-[640px]:p-4">
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
