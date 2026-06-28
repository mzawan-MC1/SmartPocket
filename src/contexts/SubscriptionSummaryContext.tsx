'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchSubscriptionSummary } from '@/lib/subscription/client';
import type { BillingAvailability, SubscriptionSummary } from '@/lib/subscription/types';

type SubscriptionSummaryContextValue = {
  summary: SubscriptionSummary | null;
  billing: BillingAvailability | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const SubscriptionSummaryContext = createContext<SubscriptionSummaryContextValue>({
  summary: null,
  billing: null,
  loading: true,
  error: null,
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
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setSummary(null);
      setBilling(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await fetchSubscriptionSummary();
      setSummary(payload?.summary || null);
      setBilling(payload?.billing || null);
    } catch {
      setSummary(null);
      setBilling(null);
      setError('Failed to load subscription details.');
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
    error,
    refresh,
  }), [billing, error, loading, refresh, summary]);

  return (
    <SubscriptionSummaryContext.Provider value={value}>
      {children}
    </SubscriptionSummaryContext.Provider>
  );
}
