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

export function pickFirstCurrencyCode(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = normalizeCurrencyCode(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
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

let cachedResolvedUserDefaultCurrency: string | null = null;
let inFlightResolvedUserDefaultCurrency: Promise<string> | null = null;

type ResolveUserDefaultCurrencyOptions = {
  platformCurrency?: string | null;
  forceRefresh?: boolean;
};

export function clearResolvedUserDefaultCurrencyCache() {
  cachedResolvedUserDefaultCurrency = null;
  inFlightResolvedUserDefaultCurrency = null;
}

async function loadResolvedUserDefaultCurrency(
  options: ResolveUserDefaultCurrencyOptions = {}
) {
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
        cachedResolvedUserDefaultCurrency = userCurrency;
        return userCurrency;
      }
    }
  } catch {
    // Keep display helpers resilient if profile lookup fails.
  }

  const normalizedPlatformCurrency = normalizeCurrencyCode(options.platformCurrency);
  if (normalizedPlatformCurrency) {
    cachedResolvedUserDefaultCurrency = normalizedPlatformCurrency;
    return normalizedPlatformCurrency;
  }

  try {
    const referenceData = await getClientReferenceData();
    const platformCurrency = normalizeCurrencyCode(referenceData.platformDefaultCurrency);
    if (platformCurrency) {
      cachedResolvedUserDefaultCurrency = platformCurrency;
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
      cachedResolvedUserDefaultCurrency = platformCurrency;
      return platformCurrency;
    }
  } catch {
    // Final fallback below keeps zero states renderable.
  }

  cachedResolvedUserDefaultCurrency = 'USD';
  return 'USD';
}

export async function resolveUserDefaultCurrency(
  preferredCurrency?: string | null,
  options: ResolveUserDefaultCurrencyOptions = {}
) {
  const normalizedPreferred = normalizeCurrencyCode(preferredCurrency);
  if (normalizedPreferred) {
    return normalizedPreferred;
  }

  if (options.forceRefresh) {
    return loadResolvedUserDefaultCurrency(options);
  }

  if (cachedResolvedUserDefaultCurrency) {
    return cachedResolvedUserDefaultCurrency;
  }

  if (inFlightResolvedUserDefaultCurrency) {
    return inFlightResolvedUserDefaultCurrency;
  }

  inFlightResolvedUserDefaultCurrency = loadResolvedUserDefaultCurrency(options).finally(() => {
    inFlightResolvedUserDefaultCurrency = null;
  });

  return inFlightResolvedUserDefaultCurrency;
}

export async function resolveCurrencyPreference(options: {
  existingCurrency?: string | null;
  accountCurrency?: string | null;
  userCurrency?: string | null;
  platformCurrency?: string | null;
  forceRefreshUserDefault?: boolean;
} = {}) {
  const prioritizedCurrency = pickFirstCurrencyCode(
    options.existingCurrency,
    options.accountCurrency,
    options.userCurrency
  );

  if (prioritizedCurrency) {
    return prioritizedCurrency;
  }

  return resolveUserDefaultCurrency(undefined, {
    platformCurrency: options.platformCurrency,
    forceRefresh: options.forceRefreshUserDefault,
  });
}
