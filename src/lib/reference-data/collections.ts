import type {
  CountryCurrencyReference,
  CountryReference,
  CurrencyReference,
} from '@/lib/reference-data/types';

export function compareCurrenciesByName(left: CurrencyReference, right: CurrencyReference) {
  return (
    left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }) ||
    left.code.localeCompare(right.code)
  );
}

export function compareCountriesByName(left: CountryReference, right: CountryReference) {
  return (
    left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }) ||
    left.isoAlpha2.localeCompare(right.isoAlpha2)
  );
}

export function getFeaturedCurrencies(currencies: CurrencyReference[]) {
  return currencies
    .filter((currency) => currency.isFeatured)
    .sort(
      (left, right) =>
        left.featuredSortOrder - right.featuredSortOrder || compareCurrenciesByName(left, right)
    );
}

export function getRemainingCurrencies(currencies: CurrencyReference[]) {
  const featuredCodes = new Set(getFeaturedCurrencies(currencies).map((currency) => currency.code));
  return currencies
    .filter((currency) => !featuredCodes.has(currency.code))
    .sort(compareCurrenciesByName);
}

export function getSelectableActiveCurrencies(currencies: CurrencyReference[]) {
  const activeCurrencies = currencies.filter((currency) => currency.isActive);
  return [...getFeaturedCurrencies(activeCurrencies), ...getRemainingCurrencies(activeCurrencies)];
}

export function getFeaturedCountries(countries: CountryReference[]) {
  return countries
    .filter((country) => country.isFeatured)
    .sort(
      (left, right) =>
        left.featuredSortOrder - right.featuredSortOrder || compareCountriesByName(left, right)
    );
}

export function getRemainingCountries(countries: CountryReference[]) {
  const featuredCodes = new Set(getFeaturedCountries(countries).map((country) => country.isoAlpha2));
  return countries
    .filter((country) => !featuredCodes.has(country.isoAlpha2))
    .sort(compareCountriesByName);
}

export function getSelectableActiveCountries(countries: CountryReference[]) {
  const activeCountries = countries.filter((country) => country.isActive);
  return [...getFeaturedCountries(activeCountries), ...getRemainingCountries(activeCountries)];
}

export function buildCountriesByCurrency(
  countries: CountryReference[],
  mappings: CountryCurrencyReference[]
) {
  const countryByCode = new Map(countries.map((country) => [country.isoAlpha2, country]));
  const countriesByCurrency = new Map<string, CountryReference[]>();

  for (const mapping of mappings) {
    const country = countryByCode.get(mapping.countryCode);
    if (!country) continue;
    const existing = countriesByCurrency.get(mapping.currencyCode) ?? [];
    existing.push(country);
    countriesByCurrency.set(mapping.currencyCode, existing);
  }

  for (const [currencyCode, value] of countriesByCurrency.entries()) {
    countriesByCurrency.set(currencyCode, value.sort(compareCountriesByName));
  }

  return countriesByCurrency;
}

export function buildCurrenciesByCountry(
  currencies: CurrencyReference[],
  mappings: CountryCurrencyReference[]
) {
  const currencyByCode = new Map(currencies.map((currency) => [currency.code, currency]));
  const currenciesByCountry = new Map<string, CurrencyReference[]>();

  for (const mapping of mappings) {
    const currency = currencyByCode.get(mapping.currencyCode);
    if (!currency) continue;
    const existing = currenciesByCountry.get(mapping.countryCode) ?? [];
    existing.push(currency);
    currenciesByCountry.set(mapping.countryCode, existing);
  }

  for (const [countryCode, value] of currenciesByCountry.entries()) {
    currenciesByCountry.set(countryCode, value.sort(compareCurrenciesByName));
  }

  return currenciesByCountry;
}

export function getNextFeaturedSortOrder(
  items: Array<{ isFeatured: boolean; featuredSortOrder: number }>
) {
  const maxValue = items
    .filter((item) => item.isFeatured)
    .reduce((max, item) => Math.max(max, item.featuredSortOrder), 0);

  return maxValue + 1;
}
