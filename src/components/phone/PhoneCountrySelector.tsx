'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import SearchField from '@/components/ui/SearchField';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { getSelectableActiveCountries } from '@/lib/reference-data/collections';
import {
  getCountryByCode,
  normalizeCountryCode,
  normalizeSearchValue,
} from '@/lib/reference-data/lookups';

interface PhoneCountrySelectorProps {
  value?: string | null;
  onChange: (countryCode: string) => void;
  disabled?: boolean;
  className?: string;
}

export default function PhoneCountrySelector({
  value,
  onChange,
  disabled = false,
  className = '',
}: PhoneCountrySelectorProps) {
  const { data, loading } = useClientReferenceData();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const countries = data?.snapshot.countries ?? [];
  const orderedCountries = useMemo(() => getSelectableActiveCountries(countries), [countries]);
  const selectedCountry = getCountryByCode(countries, value);
  const normalizedValue = normalizeCountryCode(value);

  const filteredCountries = useMemo(() => {
    const query = normalizeSearchValue(search);
    return orderedCountries.filter((country) => {
      if (!query) return true;
      return [country.name, country.isoAlpha2, country.isoAlpha3, country.callingCode].some((entry) =>
        normalizeSearchValue(entry).includes(query)
      );
    });
  }, [orderedCountries, search]);

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
      onChange(filteredCountries[highlightedIndex].isoAlpha2);
      setOpen(false);
      setSearch('');
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`.trim()}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`input-base flex w-full items-center gap-2 px-3 py-2.5 text-left ${
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-accent/40'
        }`}
      >
        {selectedCountry ? (
          <>
            <span className="text-lg" aria-hidden="true">
              {selectedCountry.flag || '🌍'}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-600 text-foreground">
              {selectedCountry.callingCode || 'Code'} {selectedCountry.isoAlpha2}
            </span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            {loading ? 'Loading...' : 'Select'}
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

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(24rem,90vw)] overflow-hidden rounded-2xl border border-border bg-card shadow-card-lg">
          <div className="border-b border-border p-3">
            <SearchField
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search country or calling code..."
              inputClassName="h-9 text-sm"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            <div className="space-y-2">
              {filteredCountries.map((country, index) => (
                <button
                  key={country.isoAlpha2}
                  type="button"
                  onClick={() => {
                    onChange(country.isoAlpha2);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                    country.isoAlpha2 === normalizedValue
                      ? 'border-accent bg-accent/5 shadow-card-sm'
                      : index === highlightedIndex
                        ? 'border-accent/40 bg-muted/30'
                        : 'border-border bg-card hover:border-accent/40 hover:bg-muted/30'
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-lg">
                    <span aria-hidden="true">{country.flag || '🌍'}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-700 text-foreground">{country.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {[country.isoAlpha2, country.callingCode].filter(Boolean).join(' • ')}
                    </p>
                  </div>
                  {country.isoAlpha2 === normalizedValue ? (
                    <Check size={14} className="shrink-0 text-accent" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
