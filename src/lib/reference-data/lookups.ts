import type {
  CountryCurrencyReference,
  CountryReference,
  CurrencyReference,
  ReferenceDataSnapshot,
} from '@/lib/reference-data/types';

export function normalizeSearchValue(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

export function normalizeCurrencyCode(value: string | null | undefined) {
  const normalized = (value || '').trim().toUpperCase();
  return normalized.length === 3 ? normalized : '';
}

export function normalizeCountryCode(value: string | null | undefined) {
  const normalized = (value || '').trim().toUpperCase();
  return normalized.length === 2 ? normalized : '';
}

export function buildCurrencyByCode(currencies: CurrencyReference[]) {
  return new Map(currencies.map((currency) => [currency.code, currency]));
}

export function buildCountryByCode(countries: CountryReference[]) {
  return new Map(countries.map((country) => [country.isoAlpha2, country]));
}

export function buildCountryNamesByCurrency(
  countries: CountryReference[],
  mappings: CountryCurrencyReference[]
) {
  const countryByCode = buildCountryByCode(countries);
  const namesByCurrency = new Map<string, string[]>();

  for (const mapping of mappings) {
    const country = countryByCode.get(mapping.countryCode);
    if (!country) continue;
    const current = namesByCurrency.get(mapping.currencyCode) ?? [];
    current.push(country.name);
    namesByCurrency.set(mapping.currencyCode, current);
  }

  for (const [currencyCode, names] of namesByCurrency.entries()) {
    namesByCurrency.set(
      currencyCode,
      Array.from(new Set(names)).sort((left, right) =>
        left.localeCompare(right, 'en', { sensitivity: 'base' })
      )
    );
  }

  return namesByCurrency;
}

export function buildCurrencyCodesByCountry(
  countries: CountryReference[],
  mappings: CountryCurrencyReference[]
) {
  const countryCodeSet = new Set(countries.map((country) => country.isoAlpha2));
  const currencyCodesByCountry = new Map<string, string[]>();

  for (const mapping of mappings) {
    if (!countryCodeSet.has(mapping.countryCode)) continue;
    const current = currencyCodesByCountry.get(mapping.countryCode) ?? [];
    current.push(mapping.currencyCode);
    currencyCodesByCountry.set(mapping.countryCode, current);
  }

  for (const [countryCode, codes] of currencyCodesByCountry.entries()) {
    currencyCodesByCountry.set(countryCode, Array.from(new Set(codes)).sort());
  }

  return currencyCodesByCountry;
}

export function getCurrencyByCode(
  currencies: CurrencyReference[],
  currencyCode: string | null | undefined
) {
  const normalizedCode = normalizeCurrencyCode(currencyCode);
  if (!normalizedCode) return null;
  return currencies.find((currency) => currency.code === normalizedCode) ?? null;
}

export function getCountryByCode(
  countries: CountryReference[],
  countryCode: string | null | undefined
) {
  const normalizedCode = normalizeCountryCode(countryCode);
  if (!normalizedCode) return null;
  return countries.find((country) => country.isoAlpha2 === normalizedCode) ?? null;
}

export function getDefaultCurrencyForCountry(
  snapshot: ReferenceDataSnapshot,
  countryCode: string | null | undefined
) {
  const country = getCountryByCode(snapshot.countries, countryCode);
  if (!country?.defaultCurrencyCode) return null;
  return getCurrencyByCode(snapshot.currencies, country.defaultCurrencyCode);
}

export function getCountryCurrencyCodes(
  snapshot: ReferenceDataSnapshot,
  countryCode: string | null | undefined
) {
  const normalizedCode = normalizeCountryCode(countryCode);
  if (!normalizedCode) return [];

  return snapshot.countryCurrencies
    .filter((mapping) => mapping.countryCode === normalizedCode)
    .sort(
      (left, right) =>
        Number(right.isDefault) - Number(left.isDefault) || left.priority - right.priority
    )
    .map((mapping) => mapping.currencyCode);
}

export function getCallingCodeDisplay(country: Pick<CountryReference, 'callingCode'> | null | undefined) {
  return country?.callingCode?.trim() || '';
}
