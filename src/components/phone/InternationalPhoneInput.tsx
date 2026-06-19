'use client';

import React, { useEffect, useMemo, useState } from 'react';
import PhoneCountrySelector from '@/components/phone/PhoneCountrySelector';
import { useClientReferenceData } from '@/lib/reference-data/client';
import {
  buildNormalizedPhoneParts,
  getInitialPhoneCountryCode,
  rebuildPhoneForCountryChange,
} from '@/lib/phone';
import type { CountryReference } from '@/lib/reference-data/types';

export interface InternationalPhoneValue {
  display: string;
  e164: string | null;
  countryCode: string | null;
  callingCode: string | null;
  nationalNumber: string;
  isValid: boolean;
}

interface InternationalPhoneInputProps {
  value?: string | null;
  countryCode?: string | null;
  onChange: (value: InternationalPhoneValue) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  helperText?: string | null;
  countries?: CountryReference[];
  countriesLoading?: boolean;
}

export default function InternationalPhoneInput({
  value,
  countryCode,
  onChange,
  label,
  placeholder = 'Optional phone number',
  disabled = false,
  className = '',
  helperText = null,
  countries: providedCountries,
  countriesLoading = false,
}: InternationalPhoneInputProps) {
  const { data, loading } = useClientReferenceData();
  const countries = providedCountries ?? data?.snapshot.countries ?? [];
  const isCountriesLoading = providedCountries ? countriesLoading : loading;
  const [selectedCountryCode, setSelectedCountryCode] = useState(() =>
    getInitialPhoneCountryCode({ explicitCountryCode: countryCode, inferredPhoneValue: value, countries })
  );

  useEffect(() => {
    if (countries.length === 0) return;
    setSelectedCountryCode(
      getInitialPhoneCountryCode({
        explicitCountryCode: countryCode,
        inferredPhoneValue: value,
        fallbackCountryCode: selectedCountryCode,
        countries,
      })
    );
  }, [countries, countryCode, selectedCountryCode, value]);

  const normalized = useMemo(
    () =>
      buildNormalizedPhoneParts({
        value,
        countryCode: selectedCountryCode,
        countries,
      }),
    [countries, selectedCountryCode, value]
  );

  const emitChange = (nextDisplay: string, nextCountryCode = selectedCountryCode) => {
    const nextNormalized = buildNormalizedPhoneParts({
      value: nextDisplay,
      countryCode: nextCountryCode,
      countries,
    });

    onChange({
      display: nextNormalized.display,
      e164: nextNormalized.e164,
      countryCode: nextNormalized.countryCode,
      callingCode: nextNormalized.callingCode,
      nationalNumber: nextNormalized.nationalNumber,
      isValid: nextNormalized.isValid,
    });
  };

  return (
    <div className={className}>
      {label ? <label className="mb-1.5 block text-sm font-600 text-foreground">{label}</label> : null}
      <div className="grid grid-cols-[minmax(10.5rem,12rem)_1fr] gap-3">
        <PhoneCountrySelector
          value={selectedCountryCode}
          onChange={(nextCountryCode) => {
            const rebuiltValue = rebuildPhoneForCountryChange({
              value,
              currentCountryCode: selectedCountryCode,
              nextCountryCode,
              countries,
            });
            setSelectedCountryCode(nextCountryCode);
            emitChange(rebuiltValue, nextCountryCode);
          }}
          disabled={disabled || isCountriesLoading}
          countries={countries}
          loading={isCountriesLoading}
        />
        <input
          type="text"
          inputMode="tel"
          autoComplete="tel"
          value={value || ''}
          onChange={(event) => emitChange(event.target.value)}
          disabled={disabled || isCountriesLoading}
          placeholder={placeholder}
          className="input-base"
        />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {helperText ? <span>{helperText}</span> : null}
        {normalized.e164 ? <span>E.164: {normalized.e164}</span> : null}
        {!normalized.e164 && value ? (
          <span>Enter a full number or choose a country code for normalization.</span>
        ) : null}
      </div>
    </div>
  );
}
