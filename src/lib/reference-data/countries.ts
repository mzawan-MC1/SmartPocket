import 'server-only';

import { getReferenceDataSnapshot } from '@/lib/reference-data/store';

function compareCountries(
  left: { name: string; isoAlpha2: string },
  right: { name: string; isoAlpha2: string }
) {
  return (
    left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }) ||
    left.isoAlpha2.localeCompare(right.isoAlpha2)
  );
}

function normalizeCallingCode(value: string) {
  return value.replace(/[^\d+]/g, '');
}

export async function getAllActiveCountries() {
  const snapshot = await getReferenceDataSnapshot();
  return snapshot.countries.filter((country) => country.isActive).sort(compareCountries);
}

export async function getFeaturedActiveCountries() {
  const snapshot = await getReferenceDataSnapshot();
  return snapshot.countries
    .filter((country) => country.isActive && country.isFeatured)
    .sort(
      (left, right) =>
        left.featuredSortOrder - right.featuredSortOrder || compareCountries(left, right)
    );
}

export async function getRemainingActiveCountries() {
  const snapshot = await getReferenceDataSnapshot();
  const featuredCodes = new Set(
    snapshot.countries
      .filter((country) => country.isActive && country.isFeatured)
      .map((country) => country.isoAlpha2)
  );

  return snapshot.countries
    .filter((country) => country.isActive && !featuredCodes.has(country.isoAlpha2))
    .sort(compareCountries);
}

export async function getCountryByIsoAlpha2(countryCode: string) {
  const snapshot = await getReferenceDataSnapshot();
  const normalizedCode = countryCode.trim().toUpperCase();
  return snapshot.countries.find((country) => country.isoAlpha2 === normalizedCode) ?? null;
}

export async function getCountriesByCallingCode(callingCode: string) {
  const snapshot = await getReferenceDataSnapshot();
  const normalizedCallingCode = normalizeCallingCode(callingCode);

  return snapshot.countries
    .filter((country) => {
      if (!country.isActive || !country.callingCode) {
        return false;
      }

      if (country.callingCode === normalizedCallingCode) {
        return true;
      }

      return country.callingCodeSuffixes.some((suffix) => {
        const combinedCode = `${country.callingCode}${suffix}`;
        return combinedCode === normalizedCallingCode || normalizedCallingCode.startsWith(combinedCode);
      });
    })
    .sort(compareCountries);
}

export async function getCountryCurrencies(countryCode: string) {
  const snapshot = await getReferenceDataSnapshot();
  const normalizedCode = countryCode.trim().toUpperCase();
  const mappings = snapshot.countryCurrencies
    .filter((mapping) => mapping.countryCode === normalizedCode)
    .sort(
      (left, right) =>
        Number(right.isDefault) - Number(left.isDefault) || left.priority - right.priority
    );

  return mappings
    .map((mapping) => snapshot.currencies.find((currency) => currency.code === mapping.currencyCode))
    .filter((currency): currency is NonNullable<typeof currency> => Boolean(currency));
}

export async function getDefaultCurrencyForCountry(countryCode: string) {
  const snapshot = await getReferenceDataSnapshot();
  const normalizedCode = countryCode.trim().toUpperCase();
  const country = snapshot.countries.find((entry) => entry.isoAlpha2 === normalizedCode);
  if (!country?.defaultCurrencyCode) {
    return null;
  }

  return snapshot.currencies.find((currency) => currency.code === country.defaultCurrencyCode) ?? null;
}
