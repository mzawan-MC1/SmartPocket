'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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

function isAbortLikeError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  return error instanceof Error && error.message === 'signal is aborted without reason';
}

export function useSubscriptionSummary() {
  return useContext(SubscriptionSummaryContext);
}

export function SubscriptionSummaryProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [billing, setBilling] = useState<BillingAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshRequestIdRef = useRef(0);
  const activeRefreshControllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    refreshRequestIdRef.current += 1;
    const requestId = refreshRequestIdRef.current;
    activeRefreshControllerRef.current?.abort();

    if (!user) {
      setSummary(null);
      setBilling(null);
      setLoading(false);
      setError(null);
      activeRefreshControllerRef.current = null;
      return;
    }

    const controller = new AbortController();
    activeRefreshControllerRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const payload = await fetchSubscriptionSummary({ signal: controller.signal });
      if (requestId !== refreshRequestIdRef.current) {
        return;
      }
      setSummary(payload?.summary || null);
      setBilling(payload?.billing || null);
    } catch (refreshError) {
      if (requestId !== refreshRequestIdRef.current) {
        return;
      }

      const isAbortError = isAbortLikeError(refreshError);
      if (isAbortError) {
        return;
      }

      setSummary(null);
      setBilling(null);
      setError('Failed to load subscription details.');
    } finally {
      if (activeRefreshControllerRef.current === controller) {
        activeRefreshControllerRef.current = null;
      }
      if (requestId === refreshRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void refresh();
  }, [authLoading, refresh]);

  useEffect(() => {
    return () => {
      refreshRequestIdRef.current += 1;
      activeRefreshControllerRef.current?.abort();
      activeRefreshControllerRef.current = null;
    };
  }, []);

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
