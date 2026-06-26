'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import FinancialAccountForm from '@/app/financial-accounts/components/FinancialAccountForm';
import ManagedPersonForm from '@/app/people/components/ManagedPersonForm';
import CreateReimbursementForm from '@/app/reimbursements/components/CreateReimbursementForm';
import AddTransactionModal from '@/app/transactions/components/AddTransactionModal';
import AddTransferForm from '@/app/transfers/components/AddTransferForm';
import {
  QuickActionsContext,
  type QuickActionId,
  type QuickActionsContextValue,
} from '@/components/quick-actions/QuickActionsContext';
import { useSubscriptionSummary } from '@/contexts/SubscriptionSummaryContext';
import { hasSubscriptionFeature } from '@/lib/subscription/entitlements';

const AIAssistantModalLazy = React.lazy(() => import('@/components/ai/AIAssistantModal'));

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

      <AddTransactionModal
        isOpen={activeAction === 'expense' || activeAction === 'income'}
        onClose={closeQuickAction}
        initialMode="single"
        initialTransactionType={initialTransactionType}
      />

      <Modal
        isOpen={activeAction === 'transfer'}
        onClose={closeQuickAction}
        title={t('transfers.newTransfer')}
        size="md"
      >
        <AddTransferForm onSuccess={closeQuickAction} onCancel={closeQuickAction} />
      </Modal>

      <Modal
        isOpen={activeAction === 'account'}
        onClose={closeQuickAction}
        title={t('accounts.addAccount')}
        size="md"
      >
        <FinancialAccountForm onSuccess={closeQuickAction} onCancel={closeQuickAction} />
      </Modal>

      <Modal
        isOpen={activeAction === 'person' && canUseManagedPeople}
        onClose={closeQuickAction}
        title={t('people.addPerson')}
        size="md"
      >
        <ManagedPersonForm onSuccess={closeQuickAction} onCancel={closeQuickAction} />
      </Modal>

      <Modal
        isOpen={activeAction === 'reimbursement' && canUseManagedPeople}
        onClose={closeQuickAction}
        title={t('reimbursements.addReimbursement')}
        size="md"
      >
        <CreateReimbursementForm onSuccess={closeQuickAction} onCancel={closeQuickAction} />
      </Modal>

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
