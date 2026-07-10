'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
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
    <AppLayout activeRoute="/personal-subscriptions" hideMobileFooter>
      <div className="mx-auto max-w-3xl space-y-3 pb-6 max-[640px]:space-y-2.5 max-[640px]:pb-2">
        <div className={`flex items-start gap-2.5 max-[640px]:gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Link
            href="/personal-subscriptions"
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted"
            aria-label={t('personalSubscriptions.actions.backToSubscriptions', { ns: 'portal' })}
          >
            <ArrowLeft size={17} className={isRTL ? 'rotate-180' : ''} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="text-[1.45rem] font-800 tracking-[-0.02em] text-foreground max-[640px]:text-[1.22rem] max-[640px]:leading-tight">
                {t('personalSubscriptions.newTitle', { ns: 'portal' })}
              </h1>
              <StatusBadge
                status="info"
                label={t('personalSubscriptions.badge', { ns: 'portal' })}
              />
            </div>
            <p className="mt-0.5 text-[13px] text-muted-foreground max-[640px]:text-[12px] max-[640px]:leading-5">
              {t('personalSubscriptions.newDescription', { ns: 'portal' })}
            </p>
          </div>
        </div>

        <PersonalSubscriptionForm
          onSuccess={(subscription) => router.push(`/personal-subscriptions/${subscription.id}`)}
          onCancel={() => router.push('/personal-subscriptions')}
        />
      </div>
    </AppLayout>
  );
}
