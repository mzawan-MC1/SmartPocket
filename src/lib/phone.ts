import type { CountryReference } from '@/lib/reference-data/types';
import { getCountryByCode, normalizeCountryCode } from '@/lib/reference-data/lookups';

export interface NormalizedPhoneParts {
  rawInput: string;
  display: string;
  e164: string | null;
  countryCode: string | null;
  callingCode: string | null;
  nationalNumber: string;
  isValid: boolean;
}

export const LEGACY_PLATFORM_CONTACT_PHONE_COUNTRY_CODE = 'AE';
const GUARDED_COUNTRY_CALLING_CODES: Record<string, string> = {
  AE: '+971',
};

export function sanitizePhoneDisplay(value: string | null | undefined) {
  return (value || '').trim().replace(/\s+/g, ' ');
}

export function normalizeDialableCharacters(value: string | null | undefined) {
  const trimmed = sanitizePhoneDisplay(value);
  if (!trimmed) return '';

  let result = '';
  for (const character of trimmed) {
    if (character >= '0' && character <= '9') {
      result += character;
      continue;
    }
    if (character === '+' && result.length === 0) {
      result += character;
    }
  }

  return result;
}

export function normalizeCallingCode(value: string | null | undefined) {
  const dialable = normalizeDialableCharacters(value);
  if (!dialable.startsWith('+')) {
    return null;
  }

  const digitsOnly = dialable.slice(1).replace(/[^\d]/g, '');
  return digitsOnly ? `+${digitsOnly}` : null;
}

export function getCanonicalCountryCallingCode(
  country: Pick<CountryReference, 'isoAlpha2' | 'callingCode'> | null | undefined
) {
  const countryCode = normalizeCountryCode(country?.isoAlpha2);
  const normalizedCallingCode = normalizeCallingCode(country?.callingCode);
  const guardedCallingCode = countryCode ? GUARDED_COUNTRY_CALLING_CODES[countryCode] ?? null : null;

  if (guardedCallingCode) {
    return guardedCallingCode;
  }

  return normalizedCallingCode;
}

function stripCallingCode(value: string, callingCode: string | null | undefined) {
  const normalizedCallingCode = normalizeDialableCharacters(callingCode);
  if (!normalizedCallingCode || !value.startsWith(normalizedCallingCode)) {
    return value;
  }
  return value.slice(normalizedCallingCode.length);
}

export function buildNormalizedPhoneParts(args: {
  value: string | null | undefined;
  countryCode?: string | null;
  countries?: CountryReference[];
}) {
  const display = sanitizePhoneDisplay(args.value);
  const dialable = normalizeDialableCharacters(display);
  const countries = args.countries ?? [];
  const selectedCountry = getCountryByCode(countries, args.countryCode);
  const selectedCountryCode = normalizeCountryCode(selectedCountry?.isoAlpha2);
  const callingCode = getCanonicalCountryCallingCode(selectedCountry);

  if (!display) {
    return {
      rawInput: '',
      display: '',
      e164: null,
      countryCode: selectedCountryCode || null,
      callingCode,
      nationalNumber: '',
      isValid: false,
    } satisfies NormalizedPhoneParts;
  }

  if (dialable.startsWith('+')) {
    const digitsOnly = dialable.slice(1);
    const isValid = digitsOnly.length >= 6 && digitsOnly.length <= 15;
    return {
      rawInput: display,
      display,
      e164: isValid ? `+${digitsOnly}` : null,
      countryCode: selectedCountryCode || null,
      callingCode,
      nationalNumber: stripCallingCode(`+${digitsOnly}`, callingCode).replace(/[^\d]/g, ''),
      isValid,
    } satisfies NormalizedPhoneParts;
  }

  const digitsOnly = dialable.replace(/[^\d]/g, '');
  const nationalNumber = digitsOnly.replace(/^0+/, '') || digitsOnly;
  const combinedDigits =
    callingCode && nationalNumber
      ? `${callingCode.replace(/[^\d]/g, '')}${nationalNumber}`
      : '';
  const isValid = combinedDigits.length >= 6 && combinedDigits.length <= 15;

  return {
    rawInput: display,
    display,
    e164: isValid ? `+${combinedDigits}` : null,
    countryCode: selectedCountryCode || null,
    callingCode,
    nationalNumber,
    isValid,
  } satisfies NormalizedPhoneParts;
}

export function getInitialPhoneCountryCode(args: {
  explicitCountryCode?: string | null;
  fallbackCountryCode?: string | null;
  countries?: CountryReference[];
}) {
  const direct = normalizeCountryCode(args.explicitCountryCode);
  if (direct) return direct;

  const fallback = normalizeCountryCode(args.fallbackCountryCode);
  if (fallback && getCountryByCode(args.countries ?? [], fallback)) {
    return fallback;
  }

  return '';
}

function inferCountryCodeFromPhoneValue(
  value: string | null | undefined,
  countries: CountryReference[] | undefined
) {
  const dialable = normalizeDialableCharacters(value);
  if (!dialable.startsWith('+') || !countries?.length) {
    return '';
  }

  const digitsOnly = dialable.slice(1);
  const matches = countries
    .filter((country) => {
      const callingDigits = getCanonicalCountryCallingCode(country)?.replace(/[^\d]/g, '') || '';
      return callingDigits ? digitsOnly.startsWith(callingDigits) : false;
    })
    .sort((left, right) => {
      const leftDigits = getCanonicalCountryCallingCode(left)?.replace(/[^\d]/g, '') || '';
      const rightDigits = getCanonicalCountryCallingCode(right)?.replace(/[^\d]/g, '') || '';
      return rightDigits.length - leftDigits.length;
    });

  return matches[0]?.isoAlpha2 || '';
}

export function getPlatformContactPhoneCountryCode(args: {
  explicitCountryCode?: string | null;
  phoneValue?: string | null;
  fallbackCountryCode?: string | null;
  countries?: CountryReference[];
}) {
  const direct = normalizeCountryCode(args.explicitCountryCode);
  if (direct) return direct;

  const inferred = inferCountryCodeFromPhoneValue(args.phoneValue, args.countries);
  if (inferred) return inferred;

  const fallback = normalizeCountryCode(args.fallbackCountryCode);
  if (fallback) return fallback;

  const dialable = normalizeDialableCharacters(args.phoneValue);
  if (dialable && !dialable.startsWith('+')) {
    return LEGACY_PLATFORM_CONTACT_PHONE_COUNTRY_CODE;
  }

  return '';
}

function formatGroupedNationalNumber(nationalNumber: string) {
  const digits = nationalNumber.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.length <= 4) return digits;

  const groups: string[] = [];
  let remaining = digits;

  groups.unshift(remaining.slice(-4));
  remaining = remaining.slice(0, -4);

  while (remaining.length > 3) {
    groups.unshift(remaining.slice(-3));
    remaining = remaining.slice(0, -3);
  }

  if (remaining) {
    groups.unshift(remaining);
  }

  return groups.join(' ');
}

export function formatNormalizedPhoneForDisplay(args: {
  value: string | null | undefined;
  countryCode?: string | null;
  countries?: CountryReference[];
}) {
  const normalized = buildNormalizedPhoneParts(args);
  if (!normalized.e164) {
    return sanitizePhoneDisplay(args.value);
  }

  const callingCodeDigits = normalized.callingCode?.replace(/[^\d]/g, '') || '';
  const nationalDigits = normalized.nationalNumber.replace(/[^\d]/g, '');
  if (!callingCodeDigits || !nationalDigits) {
    return normalized.e164;
  }

  return `+${callingCodeDigits} ${formatGroupedNationalNumber(nationalDigits)}`.trim();
}
