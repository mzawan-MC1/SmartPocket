export type CurrencySymbolType = 'text' | 'asset' | 'fallback';

export interface CurrencyReference {
  code: string;
  numericCode: string | null;
  name: string;
  nativeName: string | null;
  symbol: string;
  narrowSymbol: string | null;
  fallbackSymbol: string;
  symbolType: CurrencySymbolType;
  symbolAssetPath: string | null;
  minorUnits: number;
  isActive: boolean;
  isFeatured: boolean;
  featuredSortOrder: number;
  sortOrder: number;
}

export interface CountryReference {
  isoAlpha2: string;
  isoAlpha3: string;
  isoNumeric: string | null;
  name: string;
  nativeName: string | null;
  flag: string | null;
  callingCode: string | null;
  callingCodeSuffix: string | null;
  callingCodeSuffixes: string[];
  region: string | null;
  subregion: string | null;
  defaultCurrencyCode: string | null;
  isActive: boolean;
  isFeatured: boolean;
  featuredSortOrder: number;
  sortOrder: number;
}

export interface CountryCurrencyReference {
  countryCode: string;
  currencyCode: string;
  isDefault: boolean;
  isOfficial: boolean;
  priority: number;
}

export interface ReferenceDataSnapshot {
  currencies: CurrencyReference[];
  countries: CountryReference[];
  countryCurrencies: CountryCurrencyReference[];
}
