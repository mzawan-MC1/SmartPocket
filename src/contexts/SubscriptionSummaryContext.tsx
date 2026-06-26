'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchSubscriptionSummary } from '@/lib/subscription/client';
import type { BillingAvailability, SubscriptionSummary } from '@/lib/subscription/types';

type SubscriptionSummaryContextValue = {
  summary: SubscriptionSummary | null;
  billing: BillingAvailability | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const SubscriptionSummaryContext = createContext<SubscriptionSummaryContextValue>({
  summary: null,
  billing: null,
  loading: true,
  refresh: async () => {},
});

export function useSubscriptionSummary() {
  return useContext(SubscriptionSummaryContext);
}

export function SubscriptionSummaryProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [billing, setBilling] = useState<BillingAvailability | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setSummary(null);
      setBilling(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const payload = await fetchSubscriptionSummary();
      setSummary(payload?.summary || null);
      setBilling(payload?.billing || null);
    } catch {
      setSummary(null);
      setBilling(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void refresh();
  }, [authLoading, refresh]);

  const value = useMemo<SubscriptionSummaryContextValue>(() => ({
    summary,
    billing,
    loading,
    refresh,
  }), [billing, loading, refresh, summary]);

  return (
    <SubscriptionSummaryContext.Provider value={value}>
      {children}
    </SubscriptionSummaryContext.Provider>
  );
}
