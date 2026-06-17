import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type CurrencyReferenceSeed = {
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

type CountryReferenceSeed = {
  iso_alpha2: string;
  iso_alpha3: string;
  iso_numeric: string | null;
  name: string;
  native_name: string | null;
  flag: string | null;
  calling_code: string | null;
  calling_code_suffix: string | null;
  calling_code_suffixes: string[];
  region: string | null;
  subregion: string | null;
  default_currency_code: string | null;
  is_active: boolean;
  is_featured: boolean;
  featured_sort_order: number;
  sort_order: number;
};

type CountryCurrencyReferenceSeed = {
  country_code: string;
  currency_code: string;
  is_default: boolean;
  is_official: boolean;
  priority: number;
};

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE_DIR = path.join(ROOT_DIR, 'supabase', 'reference');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

async function readJsonFile<T>(relativePath: string) {
  const absolutePath = path.join(ROOT_DIR, relativePath);
  const contents = await readFile(absolutePath, 'utf8');
  return JSON.parse(contents) as T;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const [currencies, countries, countryCurrencies] = await Promise.all([
    readJsonFile<CurrencyReferenceSeed[]>('supabase/reference/currencies.json'),
    readJsonFile<CountryReferenceSeed[]>('supabase/reference/countries.json'),
    readJsonFile<CountryCurrencyReferenceSeed[]>('supabase/reference/country_currencies.json'),
  ]);

  assert(Array.isArray(currencies) && currencies.length > 0, 'Currencies seed file is empty.');
  assert(Array.isArray(countries) && countries.length > 0, 'Countries seed file is empty.');
  assert(Array.isArray(countryCurrencies) && countryCurrencies.length > 0, 'Country-currency seed file is empty.');

  const currencyByCode = new Map(currencies.map((currency) => [currency.code, currency]));
  const countryByCode = new Map(countries.map((country) => [country.iso_alpha2, country]));
  const mappingPairs = new Set<string>();

  for (const currency of currencies) {
    assert(/^[A-Z]{3}$/.test(currency.code), `Invalid currency code: ${currency.code}`);
    assert(
      currency.numeric_code === null || /^\d{3}$/.test(currency.numeric_code),
      `Invalid numeric currency code for ${currency.code}: ${currency.numeric_code}`
    );
    assert(currency.name.trim().length > 0, `Missing currency name for ${currency.code}`);
    assert(Number.isInteger(currency.minor_units) && currency.minor_units >= 0 && currency.minor_units <= 4, `Invalid minor units for ${currency.code}`);
    assert(
      ['text', 'asset', 'fallback'].includes(currency.symbol_type),
      `Invalid symbol_type for ${currency.code}: ${currency.symbol_type}`
    );
    assert(currency.fallback_symbol.trim().length > 0, `Missing fallback symbol for ${currency.code}`);
    assert(currency.sort_order >= 1, `Invalid sort order for ${currency.code}`);

    if (currency.symbol === currency.code) {
      assert(
        currency.symbol_type !== 'text',
        `Currency ${currency.code} uses duplicate code and text symbol without fallback typing.`
      );
    }
  }

  for (const country of countries) {
    assert(/^[A-Z]{2}$/.test(country.iso_alpha2), `Invalid ISO alpha-2 code: ${country.iso_alpha2}`);
    assert(/^[A-Z]{3}$/.test(country.iso_alpha3), `Invalid ISO alpha-3 code: ${country.iso_alpha3}`);
    assert(country.name.trim().length > 0, `Missing country name for ${country.iso_alpha2}`);
    assert(country.sort_order >= 1, `Invalid sort order for ${country.iso_alpha2}`);
    assert(
      country.calling_code === null || /^\+\d+$/.test(country.calling_code),
      `Invalid calling code for ${country.iso_alpha2}: ${country.calling_code}`
    );
    assert(
      country.calling_code_suffix === null || /^\d+$/.test(country.calling_code_suffix),
      `Invalid calling code suffix for ${country.iso_alpha2}: ${country.calling_code_suffix}`
    );
    assert(
      country.calling_code_suffixes.every((suffix) => /^\d+$/.test(suffix)),
      `Invalid calling code suffix list for ${country.iso_alpha2}`
    );
    if (country.default_currency_code !== null) {
      assert(
        currencyByCode.has(country.default_currency_code),
        `Country ${country.iso_alpha2} references unknown default currency ${country.default_currency_code}`
      );
    }
  }

  const defaultsByCountry = new Map<string, number>();

  for (const mapping of countryCurrencies) {
    assert(
      countryByCode.has(mapping.country_code),
      `Country-currency mapping uses unknown country ${mapping.country_code}`
    );
    assert(
      currencyByCode.has(mapping.currency_code),
      `Country-currency mapping uses unknown currency ${mapping.currency_code}`
    );
    assert(mapping.priority >= 1, `Invalid mapping priority for ${mapping.country_code}/${mapping.currency_code}`);

    const pairKey = `${mapping.country_code}:${mapping.currency_code}`;
    assert(!mappingPairs.has(pairKey), `Duplicate country-currency pair ${pairKey}`);
    mappingPairs.add(pairKey);

    if (mapping.is_default) {
      defaultsByCountry.set(mapping.country_code, (defaultsByCountry.get(mapping.country_code) ?? 0) + 1);
    }
  }

  for (const [countryCode, count] of defaultsByCountry.entries()) {
    assert(count === 1, `Country ${countryCode} has ${count} default currency mappings.`);
  }

  for (const country of countries) {
    if (!country.default_currency_code) {
      continue;
    }

    const matchingDefault = countryCurrencies.find(
      (mapping) => mapping.country_code === country.iso_alpha2 && mapping.currency_code === country.default_currency_code
    );

    assert(
      matchingDefault?.is_default,
      `Country ${country.iso_alpha2} default currency ${country.default_currency_code} is not marked as default in mappings.`
    );
  }

  const aed = currencyByCode.get('AED');
  assert(aed, 'AED currency is missing from the seed data.');
  assert(aed.symbol_type === 'asset', 'AED must use symbol_type = "asset".');
  assert(aed.fallback_symbol === 'AED', 'AED must use "AED" as its fallback symbol.');
  assert(aed.symbol_asset_path?.trim().length, 'AED must provide a symbol asset path.');

  const aedAssetAbsolutePath = path.join(PUBLIC_DIR, aed.symbol_asset_path!.replace(/^\//, '').replace(/\//g, path.sep));
  await access(aedAssetAbsolutePath);

  const featuredCurrencyOrders = currencies
    .filter((currency) => currency.is_featured)
    .map((currency) => currency.featured_sort_order);
  const featuredCountryOrders = countries
    .filter((country) => country.is_featured)
    .map((country) => country.featured_sort_order);

  assert(
    new Set(featuredCurrencyOrders).size === featuredCurrencyOrders.length,
    'Featured currency sort order must be deterministic.'
  );
  assert(
    new Set(featuredCountryOrders).size === featuredCountryOrders.length,
    'Featured country sort order must be deterministic.'
  );

  console.log(
    JSON.stringify(
      {
        currencies: currencies.length,
        countries: countries.length,
        countryCurrencies: countryCurrencies.length,
        referenceDir: path.relative(ROOT_DIR, REFERENCE_DIR),
        aedAsset: path.relative(ROOT_DIR, aedAssetAbsolutePath),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
