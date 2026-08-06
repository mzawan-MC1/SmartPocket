'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PersonalSubscriptionBrandLogo from '@/components/personal-subscriptions/PersonalSubscriptionBrandLogo';
import {
  PERSONAL_SUBSCRIPTION_PROVIDERS,
  findPersonalSubscriptionProvider,
  getPersonalSubscriptionProviderByKey,
  searchPersonalSubscriptionProviders,
  type PersonalSubscriptionProvider,
} from '@/lib/personal-subscription-providers';
import {
  getFieldInputClassName,
  getFieldLabelClassName,
  getRequiredMarkerClassName,
} from '@/lib/form-field-styles';

export interface PersonalSubscriptionProviderComboboxProps {
  valueKey: string | null;
  valueName: string;
  onChange: (next: { providerKey: string | null; name: string; provider?: string | null; websiteUrl?: string | null }) => void;
  onNameQueryEdited?: () => void;
  id?: string;
  label?: string;
  placeholder?: string;
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  userEditedName?: boolean;
  userEditedProvider?: boolean;
}

function useEscapeDismiss(isOpen: boolean, close: () => void) {
  useEffect(() => {
    if (!isOpen) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close]);
}

function useOutsideClickDismiss(
  wrapperRef: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
  close: () => void
) {
  useEffect(() => {
    if (!isOpen) return undefined;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(target)) {
        event.preventDefault();
        close();
      }
    }
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [isOpen, close, wrapperRef]);
}

const CUSTOM_OPTION_KEY = '__custom__';

export default function PersonalSubscriptionProviderCombobox({
  valueKey,
  valueName,
  onChange,
  onNameQueryEdited,
  id = 'subscription-provider-combobox',
  label,
  placeholder,
  error,
  required = true,
  disabled = false,
  autoFocus = false,
  userEditedName = false,
  userEditedProvider = false,
}: PersonalSubscriptionProviderComboboxProps) {
  const { t } = useTranslation(['portal', 'common']);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const selectedProvider = useMemo(
    () => (valueKey ? getPersonalSubscriptionProviderByKey(valueKey) : null),
    [valueKey]
  );

  const trimmedQuery = query.trim();
  const options = useMemo<Array<PersonalSubscriptionProvider | { key: typeof CUSTOM_OPTION_KEY; name: string }>>(() => {
    const matches = searchPersonalSubscriptionProviders(trimmedQuery, 8);
    const trimmedName = valueName.trim();

    const customEntryBase =
      trimmedName && trimmedName !== selectedProvider?.name
        ? trimmedName
        : trimmedQuery;

    const shouldOfferCustom =
      customEntryBase &&
      !matches.some((candidate) =>
        findPersonalSubscriptionProvider(customEntryBase)?.key === candidate.key
      );

    const result: Array<PersonalSubscriptionProvider | { key: typeof CUSTOM_OPTION_KEY; name: string }> = [
      ...matches,
    ];

    if (shouldOfferCustom) {
      result.push({ key: CUSTOM_OPTION_KEY, name: customEntryBase });
    } else if (result.length === 0) {
      result.push(...PERSONAL_SUBSCRIPTION_PROVIDERS.slice(0, 6));
    }

    return result;
  }, [trimmedQuery, valueName, selectedProvider]);

  useEscapeDismiss(isOpen, () => setIsOpen(false));
  useOutsideClickDismiss(wrapperRef, isOpen, () => setIsOpen(false));

  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(0);
    }
  }, [isOpen, trimmedQuery, options.length]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
    }
  }, [isOpen]);

  function selectOption(option: (typeof options)[number]) {
    if (option.key === CUSTOM_OPTION_KEY) {
      const name = (option as { key: typeof CUSTOM_OPTION_KEY; name: string }).name.trim() || valueName.trim();
      onChange({
        providerKey: null,
        name,
        provider: userEditedProvider ? null : null,
        websiteUrl: null,
      });
      setQuery('');
      setIsOpen(false);
      return;
    }

    const provider = option as PersonalSubscriptionProvider;
    const nameOut = userEditedName ? valueName.trim() : provider.name;
    const providerOut =
      userEditedProvider || (selectedProvider && valueName !== provider.name)
        ? null
        : provider.provider;
    onChange({
      providerKey: provider.key,
      name: nameOut,
      provider: providerOut,
      websiteUrl: provider.websiteDomain ? `https://${provider.websiteDomain}` : null,
    });
    setQuery('');
    setIsOpen(false);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((prev) => Math.min(options.length - 1, prev + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (event.key === 'Enter') {
      if (!isOpen) {
        setIsOpen(true);
        event.preventDefault();
        return;
      }
      const selected = options[highlightedIndex];
      if (selected) {
        event.preventDefault();
        selectOption(selected);
      }
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      if (isOpen) {
        event.preventDefault();
        setHighlightedIndex(event.key === 'Home' ? 0 : Math.max(0, options.length - 1));
      }
    }
    if (event.key === 'Tab' && isOpen) {
      setIsOpen(false);
    }
  }

  function clearSelection(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    onChange({
      providerKey: null,
      name: userEditedName ? valueName.trim() : '',
      provider: userEditedProvider && valueName.trim() ? null : null,
      websiteUrl: null,
    });
    setQuery('');
    inputRef.current?.focus({ preventScroll: true });
  }

  const hasSelectedKey = Boolean(selectedProvider);
  const hasCustomName = !selectedProvider && Boolean(valueName.trim());

  return (
    <div ref={wrapperRef} className="relative">
      {label ? (
        <label htmlFor={`${id}-input`} className={getFieldLabelClassName(Boolean(error), 'mb-1 block text-[13px] font-700 leading-4')}>
          {label}
          {required ? <span className={getRequiredMarkerClassName()}> *</span> : null}
        </label>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={getFieldInputClassName(
          `min-h-[2.75rem] w-full rounded-xl border border-border bg-card px-3 py-2 text-left text-[14px] text-foreground transition-colors hover:bg-muted/10 focus-visible:ring-2 focus-visible:ring-accent/40 max-[640px]:min-h-[2.75rem] max-[640px]:px-3 max-[640px]:py-2.5 max-[640px]:text-[0.9rem] disabled:opacity-60 disabled:cursor-not-allowed ${
            hasSelectedKey || hasCustomName ? 'pr-20' : 'pr-10'
          }`,
          Boolean(error)
        )}
      >
        <span className="flex items-center gap-2.5">
          <PersonalSubscriptionBrandLogo
            providerKey={selectedProvider?.key || null}
            fallbackName={valueName}
            size="sm"
          />
          <span className="min-w-0 flex-1">
            {selectedProvider || valueName.trim() ? (
              <span className="flex flex-col items-start gap-0.5">
                <span className="block w-full truncate text-[14px] font-700 leading-5 text-foreground">
                  {valueName.trim() || selectedProvider?.name}
                </span>
                <span className="block w-full truncate text-[11px] leading-4 text-muted-foreground">
                  {selectedProvider?.provider || t('personalSubscriptions.labels.customProvider', { ns: 'portal' })}
                </span>
              </span>
            ) : (
              <span className="text-[13px] text-muted-foreground">
                {placeholder || t('personalSubscriptions.form.placeholders.searchProvider', { ns: 'portal' })}
              </span>
            )}
          </span>
          {(hasSelectedKey || valueName.trim()) ? (
            <span className="inline-flex shrink-0 items-center">
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                aria-label={t('personalSubscriptions.actions.clearProvider', { ns: 'portal' })}
                tabIndex={-1}
              >
                <X size={14} />
              </button>
              <ChevronsUpDown size={15} className="shrink-0 text-muted-foreground/80" />
            </span>
          ) : (
            <ChevronsUpDown size={15} className="ml-auto shrink-0 text-muted-foreground/80" />
          )}
        </span>
      </button>

      {isOpen ? (
        <div
          className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-border bg-card shadow-[0_18px_40px_-18px_rgba(15,23,42,0.28)] ring-1 ring-black/5"
          role="listbox"
        >
          <div className="border-b border-border/80 bg-muted/30 p-2">
            <label htmlFor={`${id}-input`} className="sr-only">
              {t('personalSubscriptions.form.fields.name', { ns: 'portal' })}
            </label>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground/80" />
              <input
                ref={inputRef}
                id={`${id}-input`}
                type="text"
                autoFocus={autoFocus}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                value={query}
                onChange={(event) => {
                  const next = event.target.value;
                  setQuery(next);
                  onNameQueryEdited?.();
                  const nextPayload: Parameters<typeof onChange>[0] = {
                    providerKey: next.trim() === '' || selectedProvider ? valueKey : null,
                    name: next,
                  };
                  if (userEditedProvider) nextPayload.provider = null;
                  onChange(nextPayload);
                }}
                onKeyDown={onInputKeyDown}
                className="h-10 w-full rounded-lg border border-border bg-card ps-9 pe-3 text-[14px] leading-5 text-foreground placeholder:text-muted-foreground focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/25"
                placeholder={t('personalSubscriptions.form.placeholders.providerSearchHint', {
                  ns: 'portal',
                  defaultValue: 'Search ChatGPT, Netflix, Amazon Prime…',
                })}
                aria-controls={`${id}-listbox`}
                aria-activedescendant={
                  options[highlightedIndex] ? `${id}-option-${options[highlightedIndex].key}` : undefined
                }
              />
            </div>
          </div>

          <ul id={`${id}-listbox`} className="max-h-72 overflow-y-auto p-1" role="listbox">
            {options.length === 0 ? (
              <li className="px-3 py-4 text-center text-[13px] text-muted-foreground">
                {t('personalSubscriptions.form.providerNoMatches', {
                  ns: 'portal',
                  defaultValue: 'No matches. Continue typing or use a custom name.',
                })}
              </li>
            ) : (
              options.map((option, index) => {
                const isCustom = option.key === CUSTOM_OPTION_KEY;
                const provider = isCustom
                  ? null
                  : (option as PersonalSubscriptionProvider);
                const isHighlighted = highlightedIndex === index;
                const selectedByKey = selectedProvider?.key === option.key;

                return (
                  <li
                    key={option.key}
                    id={`${id}-option-${option.key}`}
                    role="option"
                    aria-selected={selectedByKey}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectOption(option);
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      selectOption(option);
                    }}
                    className={`mb-0.5 flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 ${
                      isHighlighted ? 'bg-accent/10' : 'hover:bg-muted/40'
                    }`}
                  >
                    <PersonalSubscriptionBrandLogo
                      providerKey={provider?.key || null}
                      fallbackName={isCustom ? option.name : provider?.name}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      {isCustom ? (
                        <>
                          <p className="truncate text-[13.5px] font-700 leading-5 text-foreground">
                            {t('personalSubscriptions.form.useCustomName', {
                              ns: 'portal',
                              name: (option as { key: typeof CUSTOM_OPTION_KEY; name: string }).name,
                              defaultValue: `Use “{{name}}” as a custom subscription`,
                            })}
                          </p>
                          <p className="truncate text-[11px] leading-4 text-muted-foreground">
                            {t('personalSubscriptions.form.customSubscriptionHint', {
                              ns: 'portal',
                              defaultValue: 'Not in catalog · shared fallback icon',
                            })}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="truncate text-[13.5px] font-700 leading-5 text-foreground">
                            {provider?.name}
                          </p>
                          <p className="truncate text-[11px] leading-4 text-muted-foreground">
                            {provider?.provider}
                            {provider?.category ? (
                              <>
                                {' · '}
                                <span className="capitalize">{provider.category}</span>
                              </>
                            ) : null}
                          </p>
                        </>
                      )}
                    </div>
                    {selectedByKey ? (
                      <Check size={15} className="shrink-0 text-accent" strokeWidth={2.2} />
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}

      {error ? <p className="mt-1 text-[11px] font-600 leading-4 text-negative">{error}</p> : null}
    </div>
  );
}
