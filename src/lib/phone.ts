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
  const callingCode = selectedCountry?.callingCode?.trim() || null;

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
