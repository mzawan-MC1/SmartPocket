'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

const AIAssistantModalLazy = React.lazy(() => import('@/components/ai/AIAssistantModal'));

export default function QuickActionsProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('portal');
  const [activeAction, setActiveAction] = useState<QuickActionId | null>(null);
  const initialTransactionType: 'income' | 'expense' =
    activeAction === 'income' ? 'income' : 'expense';

  const closeQuickAction = useCallback(() => {
    setActiveAction(null);
  }, []);

  const openQuickAction = useCallback((action: QuickActionId) => {
    setActiveAction(action);
  }, []);

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
        isOpen={activeAction === 'person'}
        onClose={closeQuickAction}
        title={t('people.addPerson')}
        size="md"
      >
        <ManagedPersonForm onSuccess={closeQuickAction} onCancel={closeQuickAction} />
      </Modal>

      <Modal
        isOpen={activeAction === 'reimbursement'}
        onClose={closeQuickAction}
        title={t('reimbursements.addReimbursement')}
        size="md"
      >
        <CreateReimbursementForm onSuccess={closeQuickAction} onCancel={closeQuickAction} />
      </Modal>

      {(activeAction === 'smart_entry' || activeAction === 'voice_entry') && (
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
