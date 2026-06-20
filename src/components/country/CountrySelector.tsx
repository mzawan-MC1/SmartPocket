'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SearchField from '@/components/ui/SearchField';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { getSelectableActiveCountries } from '@/lib/reference-data/collections';
import {
  buildCurrencyCodesByCountry,
  getCountryByCode,
  normalizeCountryCode,
  normalizeSearchValue,
} from '@/lib/reference-data/lookups';

interface CountrySelectorProps {
  value?: string | null;
  onChange: (countryCode: string) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  helperText?: string | null;
}

export default function CountrySelector({
  value,
  onChange,
  label,
  className = '',
  disabled = false,
  placeholder,
  helperText = null,
}: CountrySelectorProps) {
  const { t } = useTranslation('common');
  const { data, loading } = useClientReferenceData();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const snapshot = data?.snapshot;
  const resolvedPlaceholder = placeholder ?? t('country.select');
  const countries = snapshot?.countries ?? [];
  const selectedCountry = getCountryByCode(countries, value);
  const normalizedValue = normalizeCountryCode(value);

  const currencyCodesByCountry = useMemo(
    () => buildCurrencyCodesByCountry(snapshot?.countries ?? [], snapshot?.countryCurrencies ?? []),
    [snapshot?.countries, snapshot?.countryCurrencies]
  );

  const orderedCountries = useMemo(
    () => getSelectableActiveCountries(countries),
    [countries]
  );

  const filteredCountries = useMemo(() => {
    const query = normalizeSearchValue(search);

    return orderedCountries.filter((country) => {
      if (!query) return true;

      const currencyCodes = currencyCodesByCountry.get(country.isoAlpha2) ?? [];
      return [
        country.name,
        country.isoAlpha2,
        country.isoAlpha3,
        country.callingCode,
        country.defaultCurrencyCode,
        ...currencyCodes,
      ].some((entry) => normalizeSearchValue(entry).includes(query));
    });
  }, [currencyCodesByCountry, orderedCountries, search]);

  const selectedCountryMeta = selectedCountry
    ? [
        selectedCountry.isoAlpha2,
        selectedCountry.callingCode,
        selectedCountry.defaultCurrencyCode,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    setHighlightedIndex(0);
  }, [open]);

  const handleSelect = (countryCode: string) => {
    onChange(countryCode);
    setOpen(false);
    setSearch('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (disabled) return;

    if (!open && ['ArrowDown', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      return;
    }

    if (!open) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setSearch('');
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, filteredCountries.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === 'Enter' && filteredCountries[highlightedIndex]) {
      event.preventDefault();
      handleSelect(filteredCountries[highlightedIndex].isoAlpha2);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`.trim()}>
      {label ? <label className="mb-1.5 block text-sm font-600 text-foreground">{label}</label> : null}
      <button
        type="button"
        onClick={() => !disabled && setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`input-base flex w-full items-center gap-3 px-3 py-2.5 text-left ${
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-accent/40'
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {selectedCountry ? (
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-700 text-foreground">{selectedCountry.name}</span>
            </div>
            <p className="whitespace-nowrap text-sm text-muted-foreground">{selectedCountryMeta}</p>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            {loading ? t('country.loading') : resolvedPlaceholder}
          </span>
        )}
        <svg
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {helperText ? <p className="mt-1.5 text-xs text-muted-foreground">{helperText}</p> : null}

      {open ? (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-border bg-card shadow-card-lg">
          <div className="border-b border-border p-3">
            <SearchField
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('country.search')}
              inputClassName="h-9 text-sm"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {filteredCountries.length === 0 ? (
              <div className="px-4 py-5 text-center text-sm text-muted-foreground">
                {t('country.noneFound')}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCountries.map((country, index) => (
                  <button
                    key={country.isoAlpha2}
                    type="button"
                    onClick={() => handleSelect(country.isoAlpha2)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                      country.isoAlpha2 === normalizedValue
                        ? 'border-accent bg-accent/5 shadow-card-sm'
                        : index === highlightedIndex
                          ? 'border-accent/40 bg-muted/30'
                          : 'border-border bg-card hover:border-accent/40 hover:bg-muted/30'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-700 text-foreground">{country.name}</span>
                        <span className="text-xs font-600 text-muted-foreground">{country.isoAlpha2}</span>
                      </div>
                    <p className="whitespace-nowrap text-sm text-muted-foreground">
                      {[country.callingCode, country.defaultCurrencyCode].filter(Boolean).join(' • ')}
                      </p>
                    </div>
                    {country.isoAlpha2 === normalizedValue ? (
                      <Check size={14} className="shrink-0 text-accent" />
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
