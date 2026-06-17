import 'server-only';

import { cache } from 'react';
import { unstable_noStore as noStore } from 'next/cache';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
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

function createAnonReferenceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

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
  return {
    isoAlpha2: row.iso_alpha2,
    isoAlpha3: row.iso_alpha3,
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

async function readReferenceDataWithClient(supabase: SupabaseClient): Promise<ReferenceDataSnapshot> {
  const [currencyResult, countryResult, mappingResult] = await Promise.all([
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
  ]);

  if (currencyResult.error) throw currencyResult.error;
  if (countryResult.error) throw countryResult.error;
  if (mappingResult.error) throw mappingResult.error;

  return {
    currencies: (currencyResult.data ?? []).map((row) => mapCurrencyRow(row as CurrencyRow)),
    countries: (countryResult.data ?? []).map((row) => mapCountryRow(row as CountryRow)),
    countryCurrencies: (mappingResult.data ?? []).map((row) =>
      mapCountryCurrencyRow(row as CountryCurrencyRow)
    ),
  };
}

export const getReferenceDataSnapshot = cache(async (): Promise<ReferenceDataSnapshot> => {
  noStore();

  const anonClient = createAnonReferenceClient();
  if (anonClient) {
    try {
      return await readReferenceDataWithClient(anonClient);
    } catch {}
  }

  const adminClient = createAdminClient();
  if (adminClient) {
    try {
      return await readReferenceDataWithClient(adminClient);
    } catch {}
  }

  return {
    currencies: [],
    countries: [],
    countryCurrencies: [],
  };
});
