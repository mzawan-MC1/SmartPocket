'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SearchField from '@/components/ui/SearchField';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { getSelectableActiveCountries } from '@/lib/reference-data/collections';
import {
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

  const orderedCountries = useMemo(
    () => getSelectableActiveCountries(countries),
    [countries]
  );

  const filteredCountries = useMemo(() => {
    const query = normalizeSearchValue(search);

    return orderedCountries.filter((country) => {
      if (!query) return true;

      return [
        country.name,
        country.isoAlpha2,
        country.isoAlpha3,
        country.callingCode,
      ].some((entry) => normalizeSearchValue(entry).includes(query));
    });
  }, [orderedCountries, search]);

  const selectedCountryMeta = selectedCountry?.callingCode || '';

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
        className={`input-base selector-trigger flex w-full items-center gap-3 px-3 py-2.5 text-left ${
          disabled ? 'cursor-not-allowed opacity-60' : ''
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {selectedCountry ? (
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="selector-value-primary text-sm font-700">{selectedCountry.name}</span>
            </div>
            {selectedCountryMeta ? (
              <p className="selector-value-secondary whitespace-nowrap text-sm">{selectedCountryMeta}</p>
            ) : null}
          </div>
        ) : (
          <span className="selector-placeholder text-sm">
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
        <div className="selector-menu absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border shadow-card-lg">
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
                    className={`selector-option flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                      country.isoAlpha2 === normalizedValue
                        ? 'selector-option-selected'
                        : index === highlightedIndex
                          ? 'selector-option-highlighted'
                          : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-700 ${country.isoAlpha2 === normalizedValue ? 'selector-value-primary' : 'text-foreground'}`}>{country.name}</span>
                      </div>
                      {country.callingCode ? (
                        <p className={`whitespace-nowrap text-sm ${country.isoAlpha2 === normalizedValue ? 'selector-value-secondary' : 'text-muted-foreground'}`}>
                          {country.callingCode}
                        </p>
                      ) : null}
                    </div>
                    {country.isoAlpha2 === normalizedValue ? (
                      <Check size={14} className="selector-check shrink-0" />
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
