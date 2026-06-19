import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type SourceCountryCurrency = {
  name?: string;
  symbol?: string;
};

type SourceCountry = {
  cca2?: string;
  cca3?: string;
  ccn3?: string;
  status?: string;
  flag?: string;
  region?: string;
  subregion?: string;
  idd?: {
    root?: string;
    suffixes?: string[];
  };
  name?: {
    common?: string;
    native?: Record<
      string,
      {
        common?: string;
        official?: string;
      }
    >;
  };
  currencies?: Record<string, SourceCountryCurrency>;
};

type SourceIsoCurrencyRecord = {
  entity: string;
  currency: string;
  alphabeticCode: string;
  numericCode: string;
  minorUnit: string;
  withdrawalDate: string;
};

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

const VALID_SINGLE_DIGIT_COUNTRY_CALLING_CODES = new Set(['1', '7']);

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE_DIR = path.join(ROOT_DIR, 'supabase', 'reference');
const PUBLIC_CURRENCIES_DIR = path.join(ROOT_DIR, 'public', 'currencies');
const GENERATED_SEED_SQL_PATH = path.join(
  ROOT_DIR,
  'supabase',
  'migrations',
  '20260617071000_global_reference_seed.sql'
);

const COUNTRY_SOURCE_URLS = [
  'https://raw.githubusercontent.com/mledoze/countries/master/countries.json',
  'https://raw.githubusercontent.com/mledoze/countries/master/dist/countries.json',
];

const CURRENCY_SOURCE_URLS = [
  'https://raw.githubusercontent.com/datasets/currency-codes/main/data/codes-all.csv',
];

const AED_OFFICIAL_ASSET_URL =
  'https://assets.u.ae/api/public/content/4da1199046564235bcbabc394869e3a8?v=4b517110';
const AED_OFFICIAL_ASSET_PATH = '/currencies/aed-dirham-symbol-official.png';

const NON_TENDER_CURRENCY_CODES = new Set([
  'BOV',
  'CHE',
  'CHW',
  'CLF',
  'COU',
  'MXV',
  'USN',
  'UYI',
  'UYW',
  'VED',
  'XAG',
  'XAU',
  'XBA',
  'XBB',
  'XBC',
  'XBD',
  'XDR',
  'XPD',
  'XPT',
  'XSU',
  'XTS',
  'XUA',
  'XXX',
]);

const COUNTRY_CURRENCY_OVERRIDES: Record<string, string[]> = {
  CK: ['NZD'],
  CU: ['CUP'],
  CW: ['XCG'],
  FO: ['DKK'],
  GG: ['GBP'],
  IM: ['GBP'],
  JE: ['GBP'],
  KI: ['AUD'],
  SL: ['SLE'],
  SX: ['XCG'],
  TV: ['AUD'],
  ZW: ['ZWG', 'USD', 'ZAR', 'BWP', 'GBP', 'EUR', 'JPY', 'CNY', 'INR'],
};

function compareByNameThenCode(
  left: { name: string; code?: string; iso_alpha2?: string },
  right: { name: string; code?: string; iso_alpha2?: string }
) {
  const nameCompare = left.name.localeCompare(right.name, 'en', { sensitivity: 'base' });
  if (nameCompare !== 0) return nameCompare;
  return (left.code ?? left.iso_alpha2 ?? '').localeCompare(right.code ?? right.iso_alpha2 ?? '');
}

function stableStringify(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function fetchJson<T>(urls: string[]): Promise<T> {
  let lastError: unknown = null;

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'SmartPocket Reference Data Builder',
          Accept: 'application/json, text/plain, */*',
        },
      });

      if (!response.ok) {
        throw new Error(`Unexpected ${response.status} for ${url}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to fetch reference dataset.');
}

async function fetchText(urls: string[]): Promise<string> {
  let lastError: unknown = null;

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'SmartPocket Reference Data Builder',
          Accept: 'text/plain, text/csv, */*',
        },
      });

      if (!response.ok) {
        throw new Error(`Unexpected ${response.status} for ${url}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to fetch reference CSV dataset.');
}

async function fetchBinary(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'SmartPocket Reference Data Builder',
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch binary asset ${url}: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`Expected image content for ${url} but received "${contentType}".`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function normalizeSymbol(symbol: string | undefined | null) {
  const value = symbol?.trim();
  return value ? value : null;
}

function normalizeMinorUnits(value: number | string | undefined): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return 0;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = '';
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        currentValue += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === ',' && !insideQuotes) {
      currentRow.push(currentValue);
      currentValue = '';
      continue;
    }

    if ((character === '\n' || character === '\r') && !insideQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }

      currentRow.push(currentValue);
      currentValue = '';
      if (currentRow.some((value) => value.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentValue += character;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows;
}

function parseIsoCurrencyCsv(csvText: string) {
  const rows = parseCsv(csvText);
  const [header, ...records] = rows;
  const headerMap = new Map(header.map((value, index) => [value, index]));

  return records.map<SourceIsoCurrencyRecord>((record) => ({
    entity: record[headerMap.get('Entity') ?? -1] ?? '',
    currency: record[headerMap.get('Currency') ?? -1] ?? '',
    alphabeticCode: record[headerMap.get('AlphabeticCode') ?? -1] ?? '',
    numericCode: record[headerMap.get('NumericCode') ?? -1] ?? '',
    minorUnit: record[headerMap.get('MinorUnit') ?? -1] ?? '',
    withdrawalDate: record[headerMap.get('WithdrawalDate') ?? -1] ?? '',
  }));
}

function pickNativeCountryName(country: SourceCountry) {
  const entries = Object.entries(country.name?.native ?? {}).sort(([left], [right]) =>
    left.localeCompare(right)
  );

  for (const [, nativeName] of entries) {
    const candidate = nativeName.common?.trim() || nativeName.official?.trim();
    if (candidate && candidate !== country.name?.common?.trim()) {
      return candidate;
    }
  }

  return null;
}

function normalizeCallingCode(country: SourceCountry) {
  const root = country.idd?.root?.trim() || null;
  const suffixes = (country.idd?.suffixes ?? [])
    .map((suffix) => suffix.trim())
    .filter((suffix) => /^\d+$/.test(suffix));
  const rootDigits = root?.replace(/[^\d]/g, '') || '';
  const primarySuffix = suffixes[0] ?? null;
  const callingCode =
    root && primarySuffix && rootDigits.length === 1 && !VALID_SINGLE_DIGIT_COUNTRY_CALLING_CODES.has(rootDigits)
      ? `${root}${primarySuffix}`
      : root;

  return {
    callingCode,
    primarySuffix,
    suffixes,
  };
}

function buildCountrySeeds(sourceCountries: SourceCountry[]) {
  const countries = sourceCountries
    .filter((country) => country.status === 'officially-assigned')
    .map<CountryReferenceSeed>((country) => {
      const { callingCode, primarySuffix, suffixes } = normalizeCallingCode(country);
      const currencyCodes = COUNTRY_CURRENCY_OVERRIDES[country.cca2 ?? ''] ?? Object.keys(country.currencies ?? {});
      const defaultCurrencyCode = currencyCodes[0] ?? null;

      return {
        iso_alpha2: (country.cca2 ?? '').trim(),
        iso_alpha3: (country.cca3 ?? '').trim(),
        iso_numeric: country.ccn3?.trim() || null,
        name: country.name?.common?.trim() || (country.cca2 ?? '').trim(),
        native_name: pickNativeCountryName(country),
        flag: country.flag?.trim() || null,
        calling_code: callingCode,
        calling_code_suffix: primarySuffix,
        calling_code_suffixes: suffixes,
        region: country.region?.trim() || null,
        subregion: country.subregion?.trim() || null,
        default_currency_code: defaultCurrencyCode,
        is_active: true,
        is_featured: false,
        featured_sort_order: 999,
        sort_order: 999,
      };
    })
    .sort(compareByNameThenCode)
    .map((country, index) => ({
      ...country,
      sort_order: index + 1,
    }));

  return countries;
}

function buildCountryCurrencySeeds(sourceCountries: SourceCountry[]) {
  const mappings: CountryCurrencyReferenceSeed[] = [];

  for (const country of sourceCountries) {
    if (country.status !== 'officially-assigned' || !country.cca2) {
      continue;
    }

    const currencyCodes = COUNTRY_CURRENCY_OVERRIDES[country.cca2] ?? Object.keys(country.currencies ?? {});
    currencyCodes.forEach((currencyCode, index) => {
      mappings.push({
        country_code: country.cca2!,
        currency_code: currencyCode,
        is_default: index === 0,
        is_official: true,
        priority: index + 1,
      });
    });
  }

  return mappings.sort((left, right) => {
    const countryCompare = left.country_code.localeCompare(right.country_code);
    if (countryCompare !== 0) return countryCompare;
    return left.priority - right.priority;
  });
}

function buildCurrencySeeds(
  rawIsoCurrencies: SourceIsoCurrencyRecord[],
  sourceCountries: SourceCountry[],
  mappedCurrencyCodes: Set<string>
) {
  const countryCurrencySymbols = new Map<string, string>();

  for (const country of sourceCountries) {
    for (const [code, details] of Object.entries(country.currencies ?? {})) {
      const symbol = normalizeSymbol(details.symbol);
      if (symbol && !countryCurrencySymbols.has(code)) {
        countryCurrencySymbols.set(code, symbol);
      }
    }
  }

  const isoCurrencyByCode = new Map<string, SourceIsoCurrencyRecord>();
  for (const record of rawIsoCurrencies) {
    const code = record.alphabeticCode.trim();
    if (!code) continue;
    if (record.withdrawalDate.trim()) continue;
    isoCurrencyByCode.set(code, record);
  }

  const currencyCodes = [...mappedCurrencyCodes].filter((code) => !NON_TENDER_CURRENCY_CODES.has(code)).sort();

  const currencies = currencyCodes.map<CurrencyReferenceSeed>((code, index) => {
    const isoRecord = isoCurrencyByCode.get(code);

    if (!isoRecord) {
      throw new Error(`Missing active ISO 4217 source record for currency "${code}".`);
    }

    const officialName = isoRecord.currency.trim() || code;
    const sourceSymbol = countryCurrencySymbols.get(code) ?? code;
    const symbolType: CurrencyReferenceSeed['symbol_type'] =
      code === 'AED' ? 'asset' : sourceSymbol === code ? 'fallback' : 'text';

    return {
      code,
      numeric_code: isoRecord.numericCode.trim() || null,
      name: officialName,
      native_name: null,
      symbol: code === 'AED' ? 'AED' : sourceSymbol,
      narrow_symbol: null,
      fallback_symbol: code,
      symbol_type: symbolType,
      symbol_asset_path: code === 'AED' ? AED_OFFICIAL_ASSET_PATH : null,
      minor_units: normalizeMinorUnits(isoRecord.minorUnit),
      is_active: true,
      is_featured: false,
      featured_sort_order: 999,
      sort_order: index + 1,
    };
  });

  return currencies.sort(compareByNameThenCode).map((currency, index) => ({
    ...currency,
    sort_order: index + 1,
  }));
}

function buildSeedSql(
  currencies: CurrencyReferenceSeed[],
  countries: CountryReferenceSeed[],
  countryCurrencies: CountryCurrencyReferenceSeed[]
) {
  const currencyJson = JSON.stringify(currencies);
  const countryJson = JSON.stringify(countries);
  const mappingJson = JSON.stringify(countryCurrencies);

  return `-- Generated by scripts/build-reference-data.ts. Review before manual execution.
BEGIN;

WITH currency_seed AS (
  SELECT *
  FROM jsonb_to_recordset($seed$${currencyJson}$seed$::jsonb) AS x(
    code TEXT,
    numeric_code TEXT,
    name TEXT,
    native_name TEXT,
    symbol TEXT,
    narrow_symbol TEXT,
    fallback_symbol TEXT,
    symbol_type TEXT,
    symbol_asset_path TEXT,
    minor_units INTEGER,
    is_active BOOLEAN,
    is_featured BOOLEAN,
    featured_sort_order INTEGER,
    sort_order INTEGER
  )
)
INSERT INTO public.currency_registry (
  code,
  name,
  symbol,
  decimals,
  default_locale,
  symbol_position,
  symbol_spacing,
  use_symbol,
  svg_asset_path,
  is_active,
  sort_order,
  numeric_code,
  native_name,
  narrow_symbol,
  fallback_symbol,
  symbol_type,
  symbol_asset_path,
  minor_units,
  is_featured,
  featured_sort_order
)
SELECT
  code,
  name,
  symbol,
  minor_units,
  'en-US',
  'before',
  FALSE,
  symbol_type <> 'fallback',
  NULL,
  is_active,
  sort_order,
  numeric_code,
  native_name,
  narrow_symbol,
  fallback_symbol,
  symbol_type,
  symbol_asset_path,
  minor_units,
  is_featured,
  featured_sort_order
FROM currency_seed
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  symbol = EXCLUDED.symbol,
  numeric_code = EXCLUDED.numeric_code,
  native_name = EXCLUDED.native_name,
  narrow_symbol = EXCLUDED.narrow_symbol,
  fallback_symbol = EXCLUDED.fallback_symbol,
  symbol_type = EXCLUDED.symbol_type,
  symbol_asset_path = EXCLUDED.symbol_asset_path,
  minor_units = EXCLUDED.minor_units,
  decimals = COALESCE(public.currency_registry.decimals, EXCLUDED.decimals),
  default_locale = COALESCE(NULLIF(public.currency_registry.default_locale, ''), EXCLUDED.default_locale),
  symbol_position = COALESCE(NULLIF(public.currency_registry.symbol_position, ''), EXCLUDED.symbol_position),
  symbol_spacing = COALESCE(public.currency_registry.symbol_spacing, EXCLUDED.symbol_spacing),
  use_symbol = CASE
    WHEN public.currency_registry.symbol_type = 'asset' THEN FALSE
    ELSE public.currency_registry.use_symbol
  END,
  is_active = public.currency_registry.is_active,
  sort_order = public.currency_registry.sort_order,
  is_featured = public.currency_registry.is_featured,
  featured_sort_order = public.currency_registry.featured_sort_order,
  updated_at = CURRENT_TIMESTAMP;

WITH country_seed AS (
  SELECT *
  FROM jsonb_to_recordset($seed$${countryJson}$seed$::jsonb) AS x(
    iso_alpha2 TEXT,
    iso_alpha3 TEXT,
    iso_numeric TEXT,
    name TEXT,
    native_name TEXT,
    flag TEXT,
    calling_code TEXT,
    calling_code_suffix TEXT,
    calling_code_suffixes TEXT[],
    region TEXT,
    subregion TEXT,
    default_currency_code TEXT,
    is_active BOOLEAN,
    is_featured BOOLEAN,
    featured_sort_order INTEGER,
    sort_order INTEGER
  )
)
INSERT INTO public.countries (
  iso_alpha2,
  iso_alpha3,
  iso_numeric,
  name,
  native_name,
  flag,
  calling_code,
  calling_code_suffix,
  calling_code_suffixes,
  region,
  subregion,
  default_currency_code,
  is_active,
  is_featured,
  featured_sort_order,
  sort_order
)
SELECT
  iso_alpha2,
  iso_alpha3,
  iso_numeric,
  name,
  native_name,
  flag,
  calling_code,
  calling_code_suffix,
  COALESCE(calling_code_suffixes, ARRAY[]::TEXT[]),
  region,
  subregion,
  default_currency_code,
  is_active,
  is_featured,
  featured_sort_order,
  sort_order
FROM country_seed
ON CONFLICT (iso_alpha2) DO UPDATE
SET
  iso_alpha3 = EXCLUDED.iso_alpha3,
  iso_numeric = EXCLUDED.iso_numeric,
  name = EXCLUDED.name,
  native_name = EXCLUDED.native_name,
  flag = EXCLUDED.flag,
  calling_code = EXCLUDED.calling_code,
  calling_code_suffix = EXCLUDED.calling_code_suffix,
  calling_code_suffixes = EXCLUDED.calling_code_suffixes,
  region = EXCLUDED.region,
  subregion = EXCLUDED.subregion,
  default_currency_code = EXCLUDED.default_currency_code,
  is_active = public.countries.is_active,
  is_featured = public.countries.is_featured,
  featured_sort_order = public.countries.featured_sort_order,
  sort_order = public.countries.sort_order,
  updated_at = CURRENT_TIMESTAMP;

WITH mapping_seed AS (
  SELECT *
  FROM jsonb_to_recordset($seed$${mappingJson}$seed$::jsonb) AS x(
    country_code TEXT,
    currency_code TEXT,
    is_default BOOLEAN,
    is_official BOOLEAN,
    priority INTEGER
  )
)
INSERT INTO public.country_currencies (
  country_code,
  currency_code,
  is_default,
  is_official,
  priority
)
SELECT
  country_code,
  currency_code,
  is_default,
  is_official,
  priority
FROM mapping_seed
ON CONFLICT (country_code, currency_code) DO UPDATE
SET
  is_default = EXCLUDED.is_default,
  is_official = EXCLUDED.is_official,
  priority = EXCLUDED.priority,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;
`;
}

async function main() {
  const [sourceCountries, rawIsoCurrenciesCsv] = await Promise.all([
    fetchJson<SourceCountry[]>(COUNTRY_SOURCE_URLS),
    fetchText(CURRENCY_SOURCE_URLS),
  ]);
  const rawIsoCurrencies = parseIsoCurrencyCsv(rawIsoCurrenciesCsv);

  const countries = buildCountrySeeds(sourceCountries);
  const countryCurrencies = buildCountryCurrencySeeds(sourceCountries);
  const mappedCurrencyCodes = new Set(countryCurrencies.map((mapping) => mapping.currency_code));
  const currencies = buildCurrencySeeds(rawIsoCurrencies, sourceCountries, mappedCurrencyCodes);

  await Promise.all([
    mkdir(REFERENCE_DIR, { recursive: true }),
    mkdir(PUBLIC_CURRENCIES_DIR, { recursive: true }),
  ]);

  const aedOfficialAsset = await fetchBinary(AED_OFFICIAL_ASSET_URL);

  await Promise.all([
    writeFile(path.join(REFERENCE_DIR, 'currencies.json'), stableStringify(currencies), 'utf8'),
    writeFile(path.join(REFERENCE_DIR, 'countries.json'), stableStringify(countries), 'utf8'),
    writeFile(
      path.join(REFERENCE_DIR, 'country_currencies.json'),
      stableStringify(countryCurrencies),
      'utf8'
    ),
    writeFile(path.join(PUBLIC_CURRENCIES_DIR, 'aed-dirham-symbol-official.png'), aedOfficialAsset),
    writeFile(GENERATED_SEED_SQL_PATH, buildSeedSql(currencies, countries, countryCurrencies), 'utf8'),
  ]);

  console.log(
    JSON.stringify(
      {
        currencies: currencies.length,
        countries: countries.length,
        countryCurrencies: countryCurrencies.length,
        aedAssetPath: AED_OFFICIAL_ASSET_PATH,
        generatedSeedSql: path.relative(ROOT_DIR, GENERATED_SEED_SQL_PATH),
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
