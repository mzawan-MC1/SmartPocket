'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getCanonicalCountryCallingCode } from '@/lib/phone';
import type {
  CountryCurrencyReference,
  CountryReference,
  CurrencyReference,
  ReferenceDataSnapshot,
} from '@/lib/reference-data/types';

type CurrencyRow = {
  code: string;
  numeric_code: string | null;
  name: string;
  native_name: string | null;
  symbol: string;
  narrow_symbol: string | null;
  fallback_symbol: string;
  symbol_type: 'text' | 'asset' | 'fallback';
  symbol_asset_path: string | null;
  minor_units: number;
  is_active: boolean;
  is_featured: boolean;
  featured_sort_order: number;
  sort_order: number;
};

type CountryRow = {
  iso_alpha2: string;
  iso_alpha3: string;
  iso_numeric: string | null;
  name: string;
  native_name: string | null;
  flag: string | null;
  calling_code: string | null;
  calling_code_suffix: string | null;
  calling_code_suffixes: string[] | null;
  region: string | null;
  subregion: string | null;
  default_currency_code: string | null;
  is_active: boolean;
  is_featured: boolean;
  featured_sort_order: number;
  sort_order: number;
};

type CountryCurrencyRow = {
  country_code: string;
  currency_code: string;
  is_default: boolean;
  is_official: boolean;
  priority: number;
};

type PlatformSettingsRow = {
  default_currency?: string | null;
};

export interface ClientReferenceDataResult {
  snapshot: ReferenceDataSnapshot;
  platformDefaultCurrency: string | null;
}

let cachedResult: ClientReferenceDataResult | null = null;
let inFlightRequest: Promise<ClientReferenceDataResult> | null = null;
let refreshInFlightRequest: Promise<ClientReferenceDataResult> | null = null;

function mapCurrencyRow(row: CurrencyRow): CurrencyReference {
  return {
    code: row.code,
    numericCode: row.numeric_code,
    name: row.name,
    nativeName: row.native_name,
    symbol: row.symbol,
    narrowSymbol: row.narrow_symbol,
    fallbackSymbol: row.fallback_symbol,
    symbolType: row.symbol_type,
    symbolAssetPath: row.symbol_asset_path,
    minorUnits: row.minor_units,
    isActive: row.is_active,
    isFeatured: row.is_featured,
    featuredSortOrder: row.featured_sort_order,
    sortOrder: row.sort_order,
  };
}

function mapCountryRow(row: CountryRow): CountryReference {
  const mappedCountry: CountryReference = {
    isoAlpha2: row.iso_alpha2.trim().toUpperCase(),
    isoAlpha3: row.iso_alpha3.trim().toUpperCase(),
    isoNumeric: row.iso_numeric,
    name: row.name,
    nativeName: row.native_name,
    flag: row.flag,
    callingCode: row.calling_code,
    callingCodeSuffix: row.calling_code_suffix,
    callingCodeSuffixes: row.calling_code_suffixes ?? [],
    region: row.region,
    subregion: row.subregion,
    defaultCurrencyCode: row.default_currency_code,
    isActive: row.is_active,
    isFeatured: row.is_featured,
    featuredSortOrder: row.featured_sort_order,
    sortOrder: row.sort_order,
  };

  return {
    ...mappedCountry,
    callingCode: getCanonicalCountryCallingCode(mappedCountry),
  };
}

function mapCountryCurrencyRow(row: CountryCurrencyRow): CountryCurrencyReference {
  return {
    countryCode: row.country_code,
    currencyCode: row.currency_code,
    isDefault: row.is_default,
    isOfficial: row.is_official,
    priority: row.priority,
  };
}

function normalizeCurrencyCode(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized.length === 3 ? normalized : null;
}

async function loadClientReferenceData(): Promise<ClientReferenceDataResult> {
  const supabase = createClient();
  const [currencyResult, countryResult, mappingResult, platformSettingsResult] = await Promise.all([
    supabase
      .from('currency_registry')
      .select(
        'code,numeric_code,name,native_name,symbol,narrow_symbol,fallback_symbol,symbol_type,symbol_asset_path,minor_units,is_active,is_featured,featured_sort_order,sort_order'
      )
      .order('name', { ascending: true }),
    supabase
      .from('countries')
      .select(
        'iso_alpha2,iso_alpha3,iso_numeric,name,native_name,flag,calling_code,calling_code_suffix,calling_code_suffixes,region,subregion,default_currency_code,is_active,is_featured,featured_sort_order,sort_order'
      )
      .order('name', { ascending: true }),
    supabase
      .from('country_currencies')
      .select('country_code,currency_code,is_default,is_official,priority')
      .order('country_code', { ascending: true })
      .order('priority', { ascending: true }),
    supabase.from('platform_settings').select('default_currency').single(),
  ]);

  if (currencyResult.error) throw currencyResult.error;
  if (countryResult.error) throw countryResult.error;
  if (mappingResult.error) throw mappingResult.error;

  return {
    snapshot: {
      currencies: (currencyResult.data ?? []).map((row: CurrencyRow) => mapCurrencyRow(row)),
      countries: (countryResult.data ?? []).map((row: CountryRow) => mapCountryRow(row)),
      countryCurrencies: (mappingResult.data ?? []).map((row: CountryCurrencyRow) =>
        mapCountryCurrencyRow(row)
      ),
    },
    platformDefaultCurrency: normalizeCurrencyCode(
      (platformSettingsResult.data as PlatformSettingsRow | null)?.default_currency
    ),
  };
}

export async function getClientReferenceData(forceRefresh = false): Promise<ClientReferenceDataResult> {
  if (forceRefresh) {
    if (refreshInFlightRequest) {
      return refreshInFlightRequest;
    }

    refreshInFlightRequest = loadClientReferenceData()
      .then((result) => {
        cachedResult = result;
        return result;
      })
      .finally(() => {
        refreshInFlightRequest = null;
      });

    return refreshInFlightRequest;
  }

  if (!forceRefresh && cachedResult) {
    return cachedResult;
  }

  if (!forceRefresh && inFlightRequest) {
    return inFlightRequest;
  }

  inFlightRequest = loadClientReferenceData()
    .then((result) => {
      cachedResult = result;
      return result;
    })
    .finally(() => {
      inFlightRequest = null;
    });

  return inFlightRequest;
}

export function clearClientReferenceDataCache() {
  cachedResult = null;
  inFlightRequest = null;
  refreshInFlightRequest = null;
}

export function useClientReferenceData(forceRefreshOnMount = false) {
  const [state, setState] = useState<{
    data: ClientReferenceDataResult | null;
    loading: boolean;
    error: string | null;
  }>({
    data: forceRefreshOnMount ? null : cachedResult,
    loading: forceRefreshOnMount || !cachedResult,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;

    getClientReferenceData(forceRefreshOnMount)
      .then((data) => {
        if (!isMounted) return;
        setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to load reference data.',
        });
      });

    return () => {
      isMounted = false;
    };
  }, [forceRefreshOnMount]);

  return state;
}
