'use client';

import React, { createContext, useContext } from 'react';

export type QuickActionId =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'account'
  | 'person'
  | 'reimbursement'
  | 'smart_entry'
  | 'voice_entry';

export interface QuickActionsContextValue {
  openQuickAction: (action: QuickActionId) => void;
  closeQuickAction: () => void;
}

export const QuickActionsContext = createContext<QuickActionsContextValue | null>(null);

export function useQuickActions() {
  return useContext(QuickActionsContext);
}
