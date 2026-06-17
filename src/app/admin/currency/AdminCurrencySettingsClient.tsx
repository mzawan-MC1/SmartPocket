'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Save, Star } from 'lucide-react';
import { toast } from 'sonner';
import CurrencyOptionRow from '@/components/currency/CurrencyOptionRow';
import CurrencySymbol from '@/components/currency/CurrencySymbol';
import SearchField from '@/components/ui/SearchField';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { savePlatformSettings } from '@/lib/finance';
import {
  buildCountriesByCurrency,
  compareCurrenciesByName,
  getFeaturedCurrencies,
  getNextFeaturedSortOrder,
  getRemainingCurrencies,
  getSelectableActiveCurrencies,
} from '@/lib/reference-data/collections';
import { createClient } from '@/lib/supabase/client';
import type {
  CountryCurrencyReference,
  CountryReference,
  CurrencyReference,
} from '@/lib/reference-data/types';

type CurrencyFilter = 'all' | 'active' | 'inactive' | 'featured';

interface AdminCurrencySettingsClientProps {
  initialCurrencies: CurrencyReference[];
  initialCountries: CountryReference[];
  initialCountryCurrencies: CountryCurrencyReference[];
  initialDefaultCurrency: string;
}

function serializeCurrencies(currencies: CurrencyReference[]) {
  return JSON.stringify(
    [...currencies]
      .sort((left, right) => left.code.localeCompare(right.code))
      .map((currency) => ({
        code: currency.code,
        isActive: currency.isActive,
        isFeatured: currency.isFeatured,
        featuredSortOrder: currency.featuredSortOrder,
      }))
  );
}

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-700 transition ${
        active
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-border bg-card text-muted-foreground hover:border-accent/30 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function ToggleButton({
  checked,
  onClick,
  disabled = false,
  ariaLabel,
}: {
  checked: boolean;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition ${
        checked ? 'bg-accent' : 'bg-muted'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
          checked ? 'start-5.5' : 'start-0.5'
        }`}
      />
    </button>
  );
}

export default function AdminCurrencySettingsClient({
  initialCurrencies,
  initialCountries,
  initialCountryCurrencies,
  initialDefaultCurrency,
}: AdminCurrencySettingsClientProps) {
  const router = useRouter();
  const [currencies, setCurrencies] = useState(initialCurrencies);
  const [defaultCurrency, setDefaultCurrency] = useState(initialDefaultCurrency);
  const [baselineCurrencies, setBaselineCurrencies] = useState(initialCurrencies);
  const [baselineDefaultCurrency, setBaselineDefaultCurrency] = useState(initialDefaultCurrency);
  const [search, setSearch] = useState('');
  const [defaultSearch, setDefaultSearch] = useState('');
  const [filter, setFilter] = useState<CurrencyFilter>('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');

  const currenciesByCode = useMemo(
    () => new Map(currencies.map((currency) => [currency.code, currency])),
    [currencies]
  );
  const countriesByCurrency = useMemo(
    () => buildCountriesByCurrency(initialCountries, initialCountryCurrencies),
    [initialCountries, initialCountryCurrencies]
  );
  const regionOptions = useMemo(
    () =>
      [...new Set(initialCountries.map((country) => country.region).filter(Boolean))]
        .sort((left, right) => (left ?? '').localeCompare(right ?? '')) as string[],
    [initialCountries]
  );

  const featuredCurrencies = useMemo(() => getFeaturedCurrencies(currencies), [currencies]);
  const remainingCurrencies = useMemo(() => getRemainingCurrencies(currencies), [currencies]);
  const activeCurrencies = useMemo(() => getSelectableActiveCurrencies(currencies), [currencies]);

  const featuredPreviewCurrencies = useMemo(
    () => featuredCurrencies.filter((currency) => currency.isActive),
    [featuredCurrencies]
  );

  const defaultSelectorCurrencies = useMemo(() => {
    const normalizedSearch = defaultSearch.trim().toLowerCase();
    return activeCurrencies.filter((currency) => {
      if (!normalizedSearch) return true;
      const countries = countriesByCurrency.get(currency.code) ?? [];
      const countryNames = countries.map((country) => country.name.toLowerCase());
      return (
        currency.code.toLowerCase().includes(normalizedSearch) ||
        currency.name.toLowerCase().includes(normalizedSearch) ||
        currency.symbol.toLowerCase().includes(normalizedSearch) ||
        currency.fallbackSymbol.toLowerCase().includes(normalizedSearch) ||
        countryNames.some((countryName) => countryName.includes(normalizedSearch))
      );
    });
  }, [activeCurrencies, countriesByCurrency, defaultSearch]);

  const filteredCurrencies = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return [...currencies]
      .sort(compareCurrenciesByName)
      .filter((currency) => {
        if (filter === 'active' && !currency.isActive) return false;
        if (filter === 'inactive' && currency.isActive) return false;
        if (filter === 'featured' && !currency.isFeatured) return false;

        const countries = countriesByCurrency.get(currency.code) ?? [];
        if (
          regionFilter !== 'all' &&
          !countries.some((country) => (country.region || 'Unspecified') === regionFilter)
        ) {
          return false;
        }

        if (!normalizedSearch) return true;

        return (
          currency.code.toLowerCase().includes(normalizedSearch) ||
          currency.name.toLowerCase().includes(normalizedSearch) ||
          currency.symbol.toLowerCase().includes(normalizedSearch) ||
          currency.fallbackSymbol.toLowerCase().includes(normalizedSearch) ||
          countries.some((country) => country.name.toLowerCase().includes(normalizedSearch))
        );
      });
  }, [countriesByCurrency, currencies, filter, regionFilter, search]);

  const hasUnsavedChanges =
    defaultCurrency !== baselineDefaultCurrency ||
    serializeCurrencies(currencies) !== serializeCurrencies(baselineCurrencies);

  const defaultCurrencyRecord = currenciesByCode.get(defaultCurrency) ?? null;

  const updateCurrency = (currencyCode: string, updater: (currency: CurrencyReference) => CurrencyReference) => {
    setCurrencies((current) =>
      current.map((currency) => (currency.code === currencyCode ? updater(currency) : currency))
    );
    setSaveState('idle');
  };

  const handleDefaultCurrencyChange = (currencyCode: string) => {
    const currency = currenciesByCode.get(currencyCode);
    if (!currency?.isActive) {
      toast.error('Only active currencies can be selected as the platform default.');
      return;
    }
    setDefaultCurrency(currencyCode);
    setSaveState('idle');
  };

  const handleActiveToggle = (currencyCode: string) => {
    const currency = currenciesByCode.get(currencyCode);
    if (!currency) return;

    if (currency.code === defaultCurrency && currency.isActive) {
      toast.error('Select another platform default before disabling this currency.');
      return;
    }

    updateCurrency(currencyCode, (current) => {
      const nextActive = !current.isActive;
      return {
        ...current,
        isActive: nextActive,
        isFeatured: nextActive ? current.isFeatured : false,
        featuredSortOrder: nextActive ? current.featuredSortOrder : 999,
      };
    });
  };

  const handleFeaturedToggle = (currencyCode: string) => {
    const currency = currenciesByCode.get(currencyCode);
    if (!currency) return;

    updateCurrency(currencyCode, (current) => {
      if (current.isFeatured) {
        return {
          ...current,
          isFeatured: false,
          featuredSortOrder: 999,
        };
      }

      return {
        ...current,
        isActive: true,
        isFeatured: true,
        featuredSortOrder: getNextFeaturedSortOrder(currencies.filter((entry) => entry.code !== current.code)),
      };
    });
  };

  const handleFeaturedOrderChange = (currencyCode: string, value: string) => {
    const parsedValue = Number.parseInt(value, 10);
    updateCurrency(currencyCode, (current) => ({
      ...current,
      isFeatured: true,
      isActive: true,
      featuredSortOrder: Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : current.featuredSortOrder,
    }));
  };

  const validateBeforeSave = () => {
    const featured = currencies
      .filter((currency) => currency.isFeatured)
      .sort((left, right) => left.featuredSortOrder - right.featuredSortOrder);
    const featuredOrders = featured.map((currency) => currency.featuredSortOrder);

    if (!defaultCurrencyRecord?.isActive) {
      return 'The platform default currency must remain active.';
    }

    if (featured.some((currency) => !currency.isActive)) {
      return 'Featured currencies must remain active.';
    }

    if (featuredOrders.some((order) => !Number.isInteger(order) || order < 1)) {
      return 'Every featured currency must use a positive featured order.';
    }

    if (new Set(featuredOrders).size !== featuredOrders.length) {
      return 'Featured currency order values must be unique.';
    }

    return null;
  };

  const handleSave = async () => {
    const validationError = validateBeforeSave();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const changedCurrencies = currencies.filter((currency) => {
      const baseline = baselineCurrencies.find((entry) => entry.code === currency.code);
      return (
        baseline &&
        (baseline.isActive !== currency.isActive ||
          baseline.isFeatured !== currency.isFeatured ||
          baseline.featuredSortOrder !== currency.featuredSortOrder)
      );
    });

    setIsSaving(true);

    try {
      const supabase = createClient();

      if (changedCurrencies.length > 0) {
        const updates = changedCurrencies.map((currency) =>
          supabase
            .from('currency_registry')
            .update({
              is_active: currency.isActive,
              is_featured: currency.isFeatured,
              featured_sort_order: currency.isFeatured ? currency.featuredSortOrder : 999,
            })
            .eq('code', currency.code)
        );

        const results = await Promise.all(updates);
        const failed = results.find((result) => result.error);
        if (failed?.error) throw failed.error;
      }

      if (defaultCurrency !== baselineDefaultCurrency) {
        await savePlatformSettings({ default_currency: defaultCurrency });
      }

      setBaselineCurrencies(currencies);
      setBaselineDefaultCurrency(defaultCurrency);
      setSaveState('saved');
      toast.success('Currency settings saved');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save currency settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-section gap-5 lg:gap-6">
      <PageHeader
        title="Currency Settings"
        description="Manage active currencies, featured order, selector previews, and the default platform currency from the global reference registry."
        badge={
          hasUnsavedChanges ? (
            <StatusBadge status="warning" label="Unsaved changes" />
          ) : saveState === 'saved' ? (
            <StatusBadge status="success" label="Saved" />
          ) : (
            <StatusBadge status="ready" label="Up to date" />
          )
        }
        actions={
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
            className="btn-primary w-full sm:w-auto"
          >
            {isSaving ? <Loader2 size={15} className="animate-spin" /> : saveState === 'saved' ? <Check size={15} /> : <Save size={15} />}
            {saveState === 'saved' && !hasUnsavedChanges ? 'Saved' : 'Save Changes'}
          </button>
        }
      />

      <SectionCard
        title="Default Platform Currency"
        description="Choose the active default used by platform settings. Featured currencies appear first, followed by all remaining active currencies in alphabetical order."
        action={
          defaultCurrencyRecord ? (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2">
              <CurrencySymbol currency={defaultCurrencyRecord} />
              <div className="text-left">
                <p className="text-sm font-700 text-foreground">{defaultCurrencyRecord.code}</p>
                <p className="text-xs text-muted-foreground">{defaultCurrencyRecord.name}</p>
              </div>
            </div>
          ) : null
        }
      >
        <div className="space-y-4">
          <SearchField
            value={defaultSearch}
            onChange={(event) => setDefaultSearch(event.target.value)}
            placeholder="Search active currencies by name, code, symbol, or country..."
          />

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-3">
              {featuredPreviewCurrencies.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Star size={14} className="text-accent" />
                    <p className="text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">
                      Featured Currencies
                    </p>
                  </div>
                  <div className="space-y-2">
                    {defaultSelectorCurrencies
                      .filter((currency) => currency.isFeatured)
                      .map((currency) => (
                        <CurrencyOptionRow
                          key={currency.code}
                          currency={currency}
                          countryCount={(countriesByCurrency.get(currency.code) ?? []).length}
                          showCountryCount
                          selected={currency.code === defaultCurrency}
                          onClick={() => handleDefaultCurrencyChange(currency.code)}
                        />
                      ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">
                  All Active Currencies
                </p>
                <div className="max-h-[28rem] space-y-2 overflow-y-auto pe-1">
                  {defaultSelectorCurrencies
                    .filter((currency) => !currency.isFeatured)
                    .map((currency) => (
                      <CurrencyOptionRow
                        key={currency.code}
                        currency={currency}
                        countryCount={(countriesByCurrency.get(currency.code) ?? []).length}
                        showCountryCount
                        selected={currency.code === defaultCurrency}
                        onClick={() => handleDefaultCurrencyChange(currency.code)}
                      />
                    ))}
                  {defaultSelectorCurrencies.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                      No active currencies match the current search.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-sm font-700 text-foreground">Default protection</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>The current default currency always stays active.</li>
                <li>Only active seeded currencies can be selected.</li>
                <li>Disabling the current default is blocked until another default is chosen.</li>
              </ul>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Featured Currencies"
        description="Feature currencies for future onboarding and settings selectors. Featured currencies stay active and are ordered by featured sort order."
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            {featuredCurrencies.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                No featured currencies yet. Use the featured toggle below to pin currencies to the top of the selector.
              </div>
            ) : (
              featuredCurrencies.map((currency) => (
                <CurrencyOptionRow
                  key={currency.code}
                  currency={currency}
                  countryCount={(countriesByCurrency.get(currency.code) ?? []).length}
                  showCountryCount
                  showFeaturedBadge
                  trailing={
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-700 uppercase tracking-[0.14em] text-muted-foreground">
                        Order
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={currency.featuredSortOrder}
                        onChange={(event) => handleFeaturedOrderChange(currency.code, event.target.value)}
                        className="input-base h-10 w-20 py-2 text-sm"
                      />
                    </div>
                  }
                />
              ))
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-700 text-foreground">Future selector preview</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Featured currencies appear first, then the rest of the active registry alphabetically with no duplicates.
            </p>
            <div className="mt-4 space-y-2">
              {featuredPreviewCurrencies.slice(0, 6).map((currency) => (
                <CurrencyOptionRow key={`preview-${currency.code}`} currency={currency} showFeaturedBadge />
              ))}
              {featuredPreviewCurrencies.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                  Featured currencies will preview here once you select them.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="All Currencies"
        description="Search and manage the seeded global currency registry. Country usage is derived from the normalized country-currency mapping."
      >
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
            <SearchField
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by currency name, code, symbol, or country..."
            />
            <select
              className="input-base"
              value={regionFilter}
              onChange={(event) => setRegionFilter(event.target.value)}
            >
              <option value="all">All regions</option>
              {regionOptions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterChip>
              <FilterChip active={filter === 'active'} onClick={() => setFilter('active')}>Active</FilterChip>
              <FilterChip active={filter === 'inactive'} onClick={() => setFilter('inactive')}>Inactive</FilterChip>
              <FilterChip active={filter === 'featured'} onClick={() => setFilter('featured')}>Featured</FilterChip>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-xs font-700 uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-3 py-2">Currency</th>
                  <th className="px-3 py-2">Numeric</th>
                  <th className="px-3 py-2">Minor Units</th>
                  <th className="px-3 py-2">Countries</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2">Featured</th>
                  <th className="px-3 py-2">Featured Order</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredCurrencies.map((currency) => {
                  const usingCountries = countriesByCurrency.get(currency.code) ?? [];
                  const isDefault = currency.code === defaultCurrency;

                  return (
                    <tr key={currency.code} className="rounded-2xl bg-card shadow-card-sm">
                      <td className="rounded-s-2xl px-3 py-3">
                        <div className="flex min-w-[240px] items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted/70">
                            <CurrencySymbol currency={currency} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-700 text-foreground">{currency.code}</span>
                              {isDefault ? <StatusBadge status="ready" label="Default" /> : null}
                              {currency.isFeatured ? <StatusBadge status="info" label="Featured" /> : null}
                            </div>
                            <p className="truncate text-sm text-muted-foreground">{currency.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-foreground">{currency.numericCode || '—'}</td>
                      <td className="px-3 py-3 text-sm text-foreground">{currency.minorUnits}</td>
                      <td className="px-3 py-3">
                        <div className="max-w-[260px] text-sm text-muted-foreground">
                          <p className="font-600 text-foreground">{usingCountries.length} countries</p>
                          <p className="truncate">{usingCountries.map((country) => country.name).join(', ') || '—'}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <ToggleButton
                          checked={currency.isActive}
                          onClick={() => handleActiveToggle(currency.code)}
                          ariaLabel={`${currency.isActive ? 'Disable' : 'Enable'} ${currency.code}`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <ToggleButton
                          checked={currency.isFeatured}
                          onClick={() => handleFeaturedToggle(currency.code)}
                          ariaLabel={`${currency.isFeatured ? 'Unfeature' : 'Feature'} ${currency.code}`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min={1}
                          value={currency.isFeatured ? currency.featuredSortOrder : ''}
                          onChange={(event) => handleFeaturedOrderChange(currency.code, event.target.value)}
                          disabled={!currency.isFeatured}
                          className="input-base h-10 w-24 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </td>
                      <td className="rounded-e-2xl px-3 py-3">
                        <StatusBadge
                          status={currency.isActive ? 'ready' : 'warning'}
                          label={currency.isActive ? 'Active' : 'Inactive'}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredCurrencies.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              No currencies match the current filters.
            </div>
          ) : null}
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Selector Ordering"
          description="Featured currencies stay at the top. Remaining active currencies continue in alphabetical order without duplicating featured entries."
        >
          <div className="space-y-2">
            {featuredPreviewCurrencies.slice(0, 5).map((currency) => (
              <CurrencyOptionRow
                key={`ordered-${currency.code}`}
                currency={currency}
                countryCount={(countriesByCurrency.get(currency.code) ?? []).length}
                showCountryCount
                showFeaturedBadge
              />
            ))}
            {remainingCurrencies
              .filter((currency) => currency.isActive)
              .slice(0, 4)
              .map((currency) => (
                <CurrencyOptionRow
                  key={`remaining-${currency.code}`}
                  currency={currency}
                  countryCount={(countriesByCurrency.get(currency.code) ?? []).length}
                  showCountryCount
                />
              ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Administrative Rules"
          description="This page manages existing seeded currency records only."
        >
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>Featured currencies are forced to remain active.</li>
            <li>Inactive currencies are automatically unfeatured.</li>
            <li>Featured orders must be unique positive integers.</li>
            <li>Only records already present in the registry can be managed here.</li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
