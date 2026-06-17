'use client';

import { createClient } from '@/lib/supabase/client';
import { getClientReferenceData } from '@/lib/reference-data/client';

export type CurrencyTotal = {
  currency: string;
  amount: number;
};

export function normalizeCurrencyCode(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized.length === 3 ? normalized : null;
}

export function sortCurrencyTotals(left: { currency: string }, right: { currency: string }) {
  return left.currency.localeCompare(right.currency, 'en', { sensitivity: 'base' });
}

export function mapCurrencyTotals(totals: Map<string, number>) {
  return Array.from(totals.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .sort(sortCurrencyTotals);
}

export function ensureZeroCurrencyTotal(
  rows: CurrencyTotal[],
  defaultCurrency: string
): CurrencyTotal[] {
  if (rows.length > 0) {
    return rows;
  }

  return [{ currency: defaultCurrency, amount: 0 }];
}

export function addCurrencyAmount(
  totals: Map<string, number>,
  currency: string | null | undefined,
  amount: number,
  fallbackCurrency: string
) {
  if (!Number.isFinite(amount) || amount === 0) return;
  const normalizedCurrency = normalizeCurrencyCode(currency) || fallbackCurrency;
  totals.set(normalizedCurrency, (totals.get(normalizedCurrency) || 0) + amount);
}

export async function resolveUserDefaultCurrency(preferredCurrency?: string | null) {
  const normalizedPreferred = normalizeCurrencyCode(preferredCurrency);
  if (normalizedPreferred) {
    return normalizedPreferred;
  }

  const supabase = createClient();

  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (userId) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('default_currency')
        .eq('id', userId)
        .maybeSingle();

      const userCurrency = normalizeCurrencyCode(profile?.default_currency);
      if (userCurrency) {
        return userCurrency;
      }
    }
  } catch {
    // Keep display helpers resilient if profile lookup fails.
  }

  try {
    const referenceData = await getClientReferenceData();
    const platformCurrency = normalizeCurrencyCode(referenceData.platformDefaultCurrency);
    if (platformCurrency) {
      return platformCurrency;
    }
  } catch {
    // Fall through to the direct platform settings lookup.
  }

  try {
    const { data: platformSettings } = await supabase
      .from('platform_settings')
      .select('default_currency')
      .maybeSingle();

    const platformCurrency = normalizeCurrencyCode(platformSettings?.default_currency);
    if (platformCurrency) {
      return platformCurrency;
    }
  } catch {
    // Final fallback below keeps zero states renderable.
  }

  return 'USD';
}
