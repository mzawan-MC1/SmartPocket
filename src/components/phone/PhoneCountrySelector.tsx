'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import SearchField from '@/components/ui/SearchField';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCanonicalCountryCallingCode } from '@/lib/phone';
import { useClientReferenceData } from '@/lib/reference-data/client';
import type { CountryReference } from '@/lib/reference-data/types';
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
  countries?: CountryReference[];
  loading?: boolean;
}

export default function PhoneCountrySelector({
  value,
  onChange,
  disabled = false,
  className = '',
  countries: providedCountries,
  loading: providedLoading,
}: PhoneCountrySelectorProps) {
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
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placement: 'top' | 'bottom';
  } | null>(null);

  const countries = providedCountries ?? data?.snapshot.countries ?? [];
  const isLoading = providedLoading ?? loading;
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

  const selectedCountryLabel = selectedCountry
    ? [selectedCountry.isoAlpha2, getCanonicalCountryCallingCode(selectedCountry)]
        .filter(Boolean)
        .join(' · ')
    : '';

  const closeMenu = useCallback(() => {
    setOpen(false);
    setSearch('');
    setMenuPosition(null);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    setHighlightedIndex(0);
  }, [open]);

  useEffect(() => {
    if (highlightedIndex >= filteredCountries.length) {
      setHighlightedIndex(Math.max(filteredCountries.length - 1, 0));
    }
  }, [filteredCountries.length, highlightedIndex]);

  const updateMenuPosition = useCallback(() => {
    if (!open || typeof window === 'undefined') return;

    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const visualViewport = window.visualViewport;
    const viewportWidth = visualViewport?.width ?? window.innerWidth;
    const viewportHeight = visualViewport?.height ?? window.innerHeight;
    const viewportOffsetLeft = visualViewport?.offsetLeft ?? 0;
    const viewportOffsetTop = visualViewport?.offsetTop ?? 0;
    const viewportPadding = 8;
    const sideOffset = 8;
    const minWidth = 280;
    const width = Math.min(
      Math.max(rect.width, minWidth),
      viewportWidth - viewportPadding * 2
    );
    const maxHeight = Math.max(240, Math.min(420, viewportHeight - viewportPadding * 2));
    const measuredHeight = Math.min(menuRef.current?.offsetHeight ?? 360, maxHeight);
    const spaceBelow = viewportOffsetTop + viewportHeight - rect.bottom;
    const spaceAbove = rect.top - viewportOffsetTop;
    const placement: 'top' | 'bottom' =
      spaceBelow < measuredHeight + sideOffset && spaceAbove > spaceBelow
        ? 'top'
        : 'bottom';
    const unclampedTop = placement === 'top'
      ? rect.top - measuredHeight - sideOffset
      : rect.bottom + sideOffset;
    const top = Math.min(
      Math.max(unclampedTop, viewportOffsetTop + viewportPadding),
      viewportOffsetTop + viewportHeight - measuredHeight - viewportPadding
    );
    const unclampedLeft = dir === 'rtl' ? rect.right - width : rect.left;
    const left = Math.min(
      Math.max(unclampedLeft, viewportOffsetLeft + viewportPadding),
      viewportOffsetLeft + viewportWidth - width - viewportPadding
    );

    setMenuPosition({ top, left, width, maxHeight, placement });
  }, [dir, open]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target) || containerRef.current?.contains(target)) {
        return;
      }
      closeMenu();
    };

    const update = () => updateMenuPosition();
    const frameId = window.requestAnimationFrame(() => {
      update();
      window.requestAnimationFrame(() => {
        searchRef.current?.focus();
      });
    });

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);

    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [closeMenu, open, updateMenuPosition]);

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
      closeMenu();
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`input-base selector-trigger flex w-full items-center gap-2 px-3 py-2.5 text-left ${
          disabled ? 'cursor-not-allowed opacity-60' : ''
        }`}
      >
        {selectedCountry ? (
          <span className="selector-value-primary min-w-0 flex-1 whitespace-nowrap text-sm font-600">
            {selectedCountryLabel}
          </span>
        ) : (
          <span className="selector-placeholder text-sm">
            {isLoading ? t('country.loading') : t('country.select')}
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

      {open && menuPosition
        ? createPortal(
            <>
              <div className="fixed inset-0 z-40" onClick={closeMenu} />
              <div
                ref={menuRef}
                className="selector-menu fixed z-50 overflow-hidden rounded-2xl border shadow-card-lg"
                style={{
                  top: menuPosition.top,
                  left: menuPosition.left,
                  width: menuPosition.width,
                  maxHeight: menuPosition.maxHeight,
                  transformOrigin: menuPosition.placement === 'top' ? 'bottom' : 'top',
                }}
              >
                <div className="border-b border-border p-3">
                  <SearchField
                    ref={searchRef}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('country.searchPhone')}
                    inputClassName="h-9 text-sm"
                  />
                </div>
                <div
                  className="overflow-y-auto p-2"
                  style={{ maxHeight: Math.max(menuPosition.maxHeight - 76, 160) }}
                >
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
                          onClick={() => {
                            onChange(country.isoAlpha2);
                            closeMenu();
                          }}
                          className={`selector-option flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                            country.isoAlpha2 === normalizedValue
                              ? 'selector-option-selected'
                              : index === highlightedIndex
                                ? 'selector-option-highlighted'
                                : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-700 ${country.isoAlpha2 === normalizedValue ? 'selector-value-primary' : 'text-foreground'}`}>{country.name}</p>
                            <p className={`whitespace-nowrap text-sm ${country.isoAlpha2 === normalizedValue ? 'selector-value-secondary' : 'text-muted-foreground'}`}>
                              {[country.isoAlpha2, getCanonicalCountryCallingCode(country)].filter(Boolean).join(' • ')}
                            </p>
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
            </>,
            document.body
          )
        : null}
    </div>
  );
}
