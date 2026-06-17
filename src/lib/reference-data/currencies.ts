import 'server-only';

import { getReferenceDataSnapshot } from '@/lib/reference-data/store';
import type { CountryReference, CurrencyReference } from '@/lib/reference-data/types';

function compareCurrencies(left: CurrencyReference, right: CurrencyReference) {
  return left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }) || left.code.localeCompare(right.code);
}

export async function getAllActiveCurrencies() {
  const snapshot = await getReferenceDataSnapshot();
  return snapshot.currencies.filter((currency) => currency.isActive).sort(compareCurrencies);
}

export async function getFeaturedActiveCurrencies() {
  const snapshot = await getReferenceDataSnapshot();
  return snapshot.currencies
    .filter((currency) => currency.isActive && currency.isFeatured)
    .sort(
      (left, right) =>
        left.featuredSortOrder - right.featuredSortOrder || compareCurrencies(left, right)
    );
}

export async function getRemainingActiveCurrencies() {
  const snapshot = await getReferenceDataSnapshot();
  const featuredCodes = new Set(
    snapshot.currencies
      .filter((currency) => currency.isActive && currency.isFeatured)
      .map((currency) => currency.code)
  );

  return snapshot.currencies
    .filter((currency) => currency.isActive && !featuredCodes.has(currency.code))
    .sort(compareCurrencies);
}

export async function getCurrencyByCode(currencyCode: string) {
  const snapshot = await getReferenceDataSnapshot();
  const normalizedCode = currencyCode.trim().toUpperCase();
  return snapshot.currencies.find((currency) => currency.code === normalizedCode) ?? null;
}

export async function getCountriesUsingCurrency(currencyCode: string): Promise<CountryReference[]> {
  const snapshot = await getReferenceDataSnapshot();
  const normalizedCode = currencyCode.trim().toUpperCase();
  const countryCodes = new Set(
    snapshot.countryCurrencies
      .filter((mapping) => mapping.currencyCode === normalizedCode)
      .map((mapping) => mapping.countryCode)
  );

  return snapshot.countries
    .filter((country) => country.isActive && countryCodes.has(country.isoAlpha2))
    .sort((left, right) => left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }));
}
