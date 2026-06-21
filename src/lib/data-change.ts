'use client';

import { useEffect, useRef } from 'react';

export const SMARTPOCKET_DATA_CHANGED_EVENT = 'smartpocket:data-changed';

export type SmartPocketDataEntity =
  | 'profile'
  | 'budgets'
  | 'dashboard'
  | 'transactions'
  | 'transaction_documents'
  | 'transfers'
  | 'financial_accounts'
  | 'categories'
  | 'people'
  | 'reimbursements'
  | 'settlements'
  | 'ai_usage'
  | 'recurring_transactions'
  | 'notifications';

export interface SmartPocketDataChangedDetail {
  source: string;
  entities: SmartPocketDataEntity[];
}

function shouldDebugLogs() {
  return process.env.NODE_ENV !== 'production';
}

function logDebug(message: string, detail?: SmartPocketDataChangedDetail) {
  if (!shouldDebugLogs()) return;
  if (detail) {
    console.debug(`[data-change] ${message}`, detail);
    return;
  }
  console.debug(`[data-change] ${message}`);
}

export function dispatchSmartPocketDataChanged(detail: SmartPocketDataChangedDetail) {
  if (typeof window === 'undefined') return;

  logDebug('dispatched', detail);

  window.dispatchEvent(
    new CustomEvent<SmartPocketDataChangedDetail>(SMARTPOCKET_DATA_CHANGED_EVENT, {
      detail,
    })
  );
}

export function useSmartPocketDataChanged(
  entities: SmartPocketDataEntity[],
  label: string,
  onChange: () => void | Promise<void>
) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const entitySet = new Set(entities);
    const handleChange = (event: Event) => {
      const customEvent = event as CustomEvent<SmartPocketDataChangedDetail>;
      const detail = customEvent.detail;
      if (!detail?.entities?.some((entity) => entitySet.has(entity))) {
        return;
      }

      logDebug(`${label} refetch`, detail);
      void onChangeRef.current();
    };

    window.addEventListener(SMARTPOCKET_DATA_CHANGED_EVENT, handleChange as EventListener);
    return () => {
      window.removeEventListener(SMARTPOCKET_DATA_CHANGED_EVENT, handleChange as EventListener);
    };
  }, [label, ...entities]);
}
