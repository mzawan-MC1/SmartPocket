'use client';

import React, { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import {
  QuickActionsContext,
  type QuickActionId,
  type QuickActionsContextValue,
} from '@/components/quick-actions/QuickActionsContext';
import { useSubscriptionSummary } from '@/contexts/SubscriptionSummaryContext';
import { hasSubscriptionFeature } from '@/lib/subscription/entitlements';

const AddTransactionModalLazy = dynamic(() => import('@/app/transactions/components/AddTransactionModal'));
const FinancialAccountFormLazy = dynamic(() => import('@/app/financial-accounts/components/FinancialAccountForm'), {
  loading: () => <QuickActionFormFallback />,
});
const ManagedPersonFormLazy = dynamic(() => import('@/app/people/components/ManagedPersonForm'), {
  loading: () => <QuickActionFormFallback />,
});
const CreateReimbursementFormLazy = dynamic(() => import('@/app/reimbursements/components/CreateReimbursementForm'), {
  loading: () => <QuickActionFormFallback />,
});
const AddTransferFormLazy = dynamic(() => import('@/app/transfers/components/AddTransferForm'), {
  loading: () => <QuickActionFormFallback />,
});
const AIAssistantModalLazy = dynamic(() => import('@/components/ai/AIAssistantModal'));

function QuickActionFormFallback() {
  return (
    <div className="space-y-3 py-1">
      <div className="skeleton h-10 w-full rounded-xl" />
      <div className="skeleton h-10 w-full rounded-xl" />
      <div className="skeleton h-20 w-full rounded-2xl" />
    </div>
  );
}

export default function QuickActionsProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('portal');
  const { summary } = useSubscriptionSummary();
  const [activeAction, setActiveAction] = useState<QuickActionId | null>(null);
  const initialTransactionType: 'income' | 'expense' =
    activeAction === 'income' ? 'income' : 'expense';
  const canUseTextAi = hasSubscriptionFeature(summary, 'text_ai');
  const canUseVoiceAi = hasSubscriptionFeature(summary, 'voice_ai');
  const canUseManagedPeople = hasSubscriptionFeature(summary, 'managed_people');

  const closeQuickAction = useCallback(() => {
    setActiveAction(null);
  }, []);

  const openQuickAction = useCallback((action: QuickActionId) => {
    if ((action === 'smart_entry' && !canUseTextAi) || (action === 'voice_entry' && !canUseVoiceAi)) {
      toast.error(t('featureGate.quickActionDenied', {
        feature: t(action === 'voice_entry' ? 'featureGate.features.voiceAi' : 'featureGate.features.textAi'),
      }));
      return;
    }

    if ((action === 'person' || action === 'reimbursement') && !canUseManagedPeople) {
      toast.error(t('featureGate.quickActionDenied', {
        feature: t('featureGate.features.managedPeople'),
      }));
      return;
    }

    setActiveAction(action);
  }, [canUseManagedPeople, canUseTextAi, canUseVoiceAi, t]);

  const contextValue = useMemo<QuickActionsContextValue>(
    () => ({
      openQuickAction,
      closeQuickAction,
    }),
    [closeQuickAction, openQuickAction]
  );

  return (
    <QuickActionsContext.Provider value={contextValue}>
      {children}

      {(activeAction === 'expense' || activeAction === 'income') ? (
        <AddTransactionModalLazy
          isOpen
          onClose={closeQuickAction}
          initialMode="single"
          initialTransactionType={initialTransactionType}
        />
      ) : null}

      {activeAction === 'transfer' ? (
        <Modal
          isOpen
          onClose={closeQuickAction}
          title={t('transfers.newTransfer')}
          size="md"
        >
          <AddTransferFormLazy onSuccess={closeQuickAction} onCancel={closeQuickAction} />
        </Modal>
      ) : null}

      {activeAction === 'account' ? (
        <Modal
          isOpen
          onClose={closeQuickAction}
          title={t('accounts.addAccount')}
          size="md"
        >
          <FinancialAccountFormLazy onSuccess={closeQuickAction} onCancel={closeQuickAction} />
        </Modal>
      ) : null}

      {(activeAction === 'person' && canUseManagedPeople) ? (
        <Modal
          isOpen
          onClose={closeQuickAction}
          title={t('people.addPerson')}
          size="md"
        >
          <ManagedPersonFormLazy onSuccess={closeQuickAction} onCancel={closeQuickAction} />
        </Modal>
      ) : null}

      {(activeAction === 'reimbursement' && canUseManagedPeople) ? (
        <Modal
          isOpen
          onClose={closeQuickAction}
          title={t('reimbursements.addReimbursement')}
          size="md"
        >
          <CreateReimbursementFormLazy onSuccess={closeQuickAction} onCancel={closeQuickAction} />
        </Modal>
      ) : null}

      {((activeAction === 'smart_entry' && canUseTextAi) || (activeAction === 'voice_entry' && canUseVoiceAi)) && (
        <React.Suspense fallback={null}>
          <AIAssistantModalLazy
            onClose={closeQuickAction}
            defaultMode={activeAction === 'voice_entry' ? 'voice' : 'text'}
          />
        </React.Suspense>
      )}
    </QuickActionsContext.Provider>
  );
}
