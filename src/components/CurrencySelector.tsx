'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import SearchField from '@/components/ui/SearchField';
import CurrencyOptionRow from '@/components/currency/CurrencyOptionRow';
import CurrencySymbol from '@/components/currency/CurrencySymbol';
import { useLanguage } from '@/contexts/LanguageContext';
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
  const { dir } = useLanguage();
  const { data, loading } = useClientReferenceData();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number; placement: 'top' | 'bottom' } | null>(null);

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
    if (!open) {
      setMenuPosition(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && menuRef.current.contains(target)) return;
      if (containerRef.current && containerRef.current.contains(target)) return;
      if (triggerRef.current && triggerRef.current.contains(target)) return;
      {
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
    setMenuPosition(null);
  };

  const closeMenu = useCallback(() => {
    setOpen(false);
    setSearch('');
    setMenuPosition(null);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, []);

  const updateMenuPosition = useCallback(() => {
    if (!open) return;
    if (typeof window === 'undefined') return;
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const sideOffset = 8;
    const minWidth = 280;
    const width = Math.min(
      Math.max(rect.width, minWidth),
      window.innerWidth - viewportPadding * 2
    );

    const measuredHeight = menuRef.current?.offsetHeight ?? 360;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const placement: 'top' | 'bottom' =
      spaceBelow < measuredHeight + sideOffset && spaceAbove > spaceBelow
        ? 'top'
        : 'bottom';

    const unclampedTop = placement === 'top'
      ? rect.top - measuredHeight - sideOffset
      : rect.bottom + sideOffset;
    const top = Math.min(
      Math.max(unclampedTop, viewportPadding),
      window.innerHeight - measuredHeight - viewportPadding
    );

    const unclampedLeft = dir === 'rtl'
      ? rect.right - width
      : rect.left;
    const left = Math.min(
      Math.max(unclampedLeft, viewportPadding),
      window.innerWidth - width - viewportPadding
    );

    setMenuPosition({ top, left, width, placement });
  }, [dir, open]);

  useEffect(() => {
    if (!open) return undefined;

    const update = () => updateMenuPosition();
    const frameId = window.requestAnimationFrame(() => {
      update();
      window.requestAnimationFrame(() => {
        searchRef.current?.focus();
      });
    });

    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, updateMenuPosition]);

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
      closeMenu();
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
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`input-base selector-trigger flex w-full min-w-0 items-center justify-between gap-3 px-3 py-2.5 text-left ${
          disabled ? 'cursor-not-allowed opacity-60' : ''
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {selectedCurrency ? (
          <div className="grid min-w-0 grid-cols-[1.25rem_auto] items-center gap-x-2 whitespace-nowrap">
            <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden leading-none">
              <CurrencySymbol currency={selectedCurrency} size="xs" alignment="center" />
            </span>
            <span className="selector-value-primary shrink-0 text-sm font-700">{selectedCurrency.code}</span>
          </div>
        ) : (
          <span className="selector-placeholder min-w-0 truncate text-sm">
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

      {open && menuPosition
        ? createPortal(
            <>
              <div className="fixed inset-0 z-40" onClick={closeMenu} />
              <div
                ref={menuRef}
                className="selector-menu fixed z-50 overflow-hidden rounded-2xl border border-border bg-card shadow-card-lg"
                style={{
                  top: menuPosition.top,
                  left: menuPosition.left,
                  width: menuPosition.width,
                  transformOrigin: menuPosition.placement === 'top' ? 'bottom' : 'top',
                }}
              >
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
                    <div className="space-y-1">
                      {filteredCurrencies.map((currency, index) => (
                        <CurrencyOptionRow
                          key={currency.code}
                          currency={currency}
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
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  );
}
