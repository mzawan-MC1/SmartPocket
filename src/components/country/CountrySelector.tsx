'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import SearchField from '@/components/ui/SearchField';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { getSelectableActiveCountries } from '@/lib/reference-data/collections';
import { useLanguage } from '@/contexts/LanguageContext';
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
  const { dir } = useLanguage();
  const { data, loading, error, refetch } = useClientReferenceData();
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
  const listboxId = useId();

  const snapshot = data?.snapshot;
  const resolvedPlaceholder = placeholder ?? t('country.select');
  const countries = snapshot?.countries ?? [];
  const selectedCountry = getCountryByCode(countries, value);
  const normalizedValue = normalizeCountryCode(value);
  const canOpenMenu = !disabled && (!loading || Boolean(error));

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
    if (!open) {
      setMenuPosition(null);
    }
  }, [open]);

  useEffect(() => {
    if (loading && !error && open) {
      setOpen(false);
      setSearch('');
      setMenuPosition(null);
    }
  }, [error, loading, open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current && menuRef.current.contains(target)) return;
      if (containerRef.current && containerRef.current.contains(target)) return;
      if (triggerRef.current && triggerRef.current.contains(target)) return;
      closeMenu();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    setHighlightedIndex(0);
  }, [open]);

  const handleSelect = (countryCode: string) => {
    onChange(countryCode);
    closeMenu();
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

    const unclampedLeft = dir === 'rtl'
      ? rect.right - width
      : rect.left;
    const left = Math.min(
      Math.max(unclampedLeft, viewportOffsetLeft + viewportPadding),
      viewportOffsetLeft + viewportWidth - width - viewportPadding
    );

    setMenuPosition({ top, left, width, maxHeight, placement });
  }, [dir, open]);

  useEffect(() => {
    if (highlightedIndex >= filteredCountries.length) {
      setHighlightedIndex(Math.max(filteredCountries.length - 1, 0));
    }
  }, [filteredCountries.length, highlightedIndex]);

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
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [open, updateMenuPosition]);

  const handleRetry = async () => {
    await refetch();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (disabled) return;

    if (!open && ['ArrowDown', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (canOpenMenu) {
        setOpen(true);
      }
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
      handleSelect(filteredCountries[highlightedIndex].isoAlpha2);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`.trim()}>
      {label ? <label className="mb-1.5 block text-sm font-600 text-foreground">{label}</label> : null}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!canOpenMenu) return;
          setOpen((current) => !current);
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`input-base selector-trigger flex min-h-12 w-full min-w-0 items-center justify-between gap-3 px-3 py-2.5 text-left ${
          disabled || (!error && loading) ? 'cursor-not-allowed opacity-60' : ''
        }`}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-busy={loading}
      >
        {selectedCountry ? (
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="selector-value-primary truncate text-sm font-700">{selectedCountry.name}</span>
            </div>
            {selectedCountryMeta ? (
              <p className="selector-value-secondary truncate whitespace-nowrap text-sm">{selectedCountryMeta}</p>
            ) : null}
          </div>
        ) : (
          <span className="selector-placeholder min-w-0 truncate text-sm">
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
                    placeholder={t('country.search')}
                    inputClassName="h-9 text-sm"
                    disabled={Boolean(error)}
                  />
                </div>
                <div
                  id={listboxId}
                  role="listbox"
                  className="overflow-y-auto p-2"
                  style={{ maxHeight: Math.max(menuPosition.maxHeight - 76, 160) }}
                >
                  {loading ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      {t('country.loading')}
                    </div>
                  ) : error ? (
                    <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
                      <p className="text-sm font-600 text-foreground">{t('country.loadFailed')}</p>
                      <p className="text-xs text-muted-foreground">{t('country.loadFailedHelp')}</p>
                      <button type="button" className="btn-secondary min-h-11" onClick={handleRetry}>
                        {t('country.retry')}
                      </button>
                    </div>
                  ) : filteredCountries.length === 0 ? (
                    <div className="px-4 py-5 text-center text-sm text-muted-foreground">
                      {t('country.noneFound')}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredCountries.map((country, index) => (
                        <button
                          key={country.isoAlpha2}
                          type="button"
                          role="option"
                          aria-selected={country.isoAlpha2 === normalizedValue}
                          onClick={() => handleSelect(country.isoAlpha2)}
                          className={`selector-option flex w-full min-w-0 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                            country.isoAlpha2 === normalizedValue
                              ? 'selector-option-selected'
                              : index === highlightedIndex
                                ? 'selector-option-highlighted'
                                : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className={`truncate text-sm font-700 ${country.isoAlpha2 === normalizedValue ? 'selector-value-primary' : 'text-foreground'}`}>
                                {country.name}
                              </span>
                            </div>
                            {country.callingCode ? (
                              <p className={`truncate whitespace-nowrap text-sm ${country.isoAlpha2 === normalizedValue ? 'selector-value-secondary' : 'text-muted-foreground'}`}>
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
            </>,
            document.body
          )
        : null}
    </div>
  );
}
