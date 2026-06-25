'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SearchField from '@/components/ui/SearchField';
import CurrencyOptionRow from '@/components/currency/CurrencyOptionRow';
import CurrencySymbol from '@/components/currency/CurrencySymbol';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { getSelectableActiveCurrencies } from '@/lib/reference-data/collections';
import {
  buildCountryNamesByCurrency,
  getCurrencyByCode,
  normalizeCurrencyCode,
  normalizeSearchValue,
} from '@/lib/reference-data/lookups';

interface CurrencySelectorProps {
  value?: string | null;
  onChange: (code: string) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  showCountryCount?: boolean;
  allowInactiveSelection?: boolean;
  helperText?: string | null;
}

export default function CurrencySelector({
  value,
  onChange,
  label,
  className = '',
  disabled = false,
  placeholder,
  showCountryCount = false,
  allowInactiveSelection = true,
  helperText = null,
}: CurrencySelectorProps) {
  const { t } = useTranslation('common');
  const { data, loading } = useClientReferenceData();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const snapshot = data?.snapshot;
  const resolvedPlaceholder = placeholder ?? t('currency.select');
  const normalizedValue = normalizeCurrencyCode(value);

  const countryNamesByCurrency = useMemo(
    () =>
      buildCountryNamesByCurrency(snapshot?.countries ?? [], snapshot?.countryCurrencies ?? []),
    [snapshot?.countries, snapshot?.countryCurrencies]
  );

  const allCurrencies = snapshot?.currencies ?? [];
  const selectedCurrency = getCurrencyByCode(allCurrencies, normalizedValue);

  const orderedCurrencies = useMemo(
    () => getSelectableActiveCurrencies(allCurrencies),
    [allCurrencies]
  );

  const filteredCurrencies = useMemo(() => {
    const query = normalizeSearchValue(search);

    const filtered = orderedCurrencies.filter((currency) => {
      if (!query) return true;

      const countryNames = countryNamesByCurrency.get(currency.code) ?? [];
      return [
        currency.code,
        currency.name,
        currency.symbol,
        currency.fallbackSymbol,
        ...countryNames,
      ].some((entry) => normalizeSearchValue(entry).includes(query));
    });

    if (
      allowInactiveSelection &&
      selectedCurrency &&
      !selectedCurrency.isActive &&
      !filtered.some((currency) => currency.code === selectedCurrency.code)
    ) {
      const selectedMatches =
        !query ||
        [
          selectedCurrency.code,
          selectedCurrency.name,
          selectedCurrency.symbol,
          selectedCurrency.fallbackSymbol,
          ...(countryNamesByCurrency.get(selectedCurrency.code) ?? []),
        ].some((entry) => normalizeSearchValue(entry).includes(query));

      if (selectedMatches) {
        filtered.unshift(selectedCurrency);
      }
    }

    return filtered;
  }, [
    allowInactiveSelection,
    countryNamesByCurrency,
    orderedCurrencies,
    search,
    selectedCurrency,
  ]);

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

  useEffect(() => {
    if (highlightedIndex >= filteredCurrencies.length) {
      setHighlightedIndex(Math.max(filteredCurrencies.length - 1, 0));
    }
  }, [filteredCurrencies.length, highlightedIndex]);

  const handleSelect = (code: string) => {
    onChange(code);
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
      setHighlightedIndex((current) => Math.min(current + 1, filteredCurrencies.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === 'Enter' && filteredCurrencies[highlightedIndex]) {
      event.preventDefault();
      handleSelect(filteredCurrencies[highlightedIndex].code);
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
        {selectedCurrency ? (
          <>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/60">
              <CurrencySymbol currency={selectedCurrency} size="sm" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="selector-value-primary text-sm font-700">{selectedCurrency.code}</span>
                {!selectedCurrency.isActive ? (
                  <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-600 text-warning">
                    {t('currency.inactive')}
                  </span>
                ) : null}
              </div>
              <p className="selector-value-secondary truncate text-sm">{selectedCurrency.name}</p>
            </div>
          </>
        ) : (
          <span className="selector-placeholder text-sm">
            {loading ? t('currency.loading') : resolvedPlaceholder}
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
              placeholder={t('currency.searchDetailed')}
              inputClassName="h-9 text-sm"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {filteredCurrencies.length === 0 ? (
              <div className="px-4 py-5 text-center text-sm text-muted-foreground">
                {t('currency.noneFound')}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCurrencies.map((currency, index) => {
                  const countryCount = countryNamesByCurrency.get(currency.code)?.length ?? 0;
                  return (
                    <CurrencyOptionRow
                      key={currency.code}
                      currency={currency}
                      countryCount={countryCount}
                      showCountryCount={showCountryCount}
                      selected={currency.code === normalizedValue}
                      className={index === highlightedIndex ? 'selector-option-highlighted' : ''}
                      trailing={
                        currency.code === normalizedValue ? (
                          <Check size={14} className="selector-check" />
                        ) : !currency.isActive ? (
                          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-600 text-warning">
                            {t('currency.inactive')}
                          </span>
                        ) : null
                      }
                      onClick={() => handleSelect(currency.code)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
