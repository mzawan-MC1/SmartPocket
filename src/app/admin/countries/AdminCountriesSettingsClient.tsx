'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Globe2, Loader2, Save, Star } from 'lucide-react';
import { toast } from 'sonner';
import SearchField from '@/components/ui/SearchField';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  buildCurrenciesByCountry,
  compareCountriesByName,
  getFeaturedCountries,
  getNextFeaturedSortOrder,
  getRemainingCountries,
  getSelectableActiveCountries,
} from '@/lib/reference-data/collections';
import { createClient } from '@/lib/supabase/client';
import type {
  CountryCurrencyReference,
  CountryReference,
  CurrencyReference,
} from '@/lib/reference-data/types';

type CountryFilter = 'all' | 'active' | 'inactive' | 'featured';

interface AdminCountriesSettingsClientProps {
  initialCountries: CountryReference[];
  initialCurrencies: CurrencyReference[];
  initialCountryCurrencies: CountryCurrencyReference[];
}

function serializeCountries(countries: CountryReference[]) {
  return JSON.stringify(
    [...countries]
      .sort((left, right) => left.isoAlpha2.localeCompare(right.isoAlpha2))
      .map((country) => ({
        isoAlpha2: country.isoAlpha2,
        isActive: country.isActive,
        isFeatured: country.isFeatured,
        featuredSortOrder: country.featuredSortOrder,
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
  ariaLabel,
}: {
  checked: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition ${
        checked ? 'bg-accent' : 'bg-muted'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
          checked ? 'start-5.5' : 'start-0.5'
        }`}
      />
    </button>
  );
}

export default function AdminCountriesSettingsClient({
  initialCountries,
  initialCurrencies,
  initialCountryCurrencies,
}: AdminCountriesSettingsClientProps) {
  const router = useRouter();
  const [countries, setCountries] = useState(initialCountries);
  const [baselineCountries, setBaselineCountries] = useState(initialCountries);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CountryFilter>('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');

  const currenciesByCountry = useMemo(
    () => buildCurrenciesByCountry(initialCurrencies, initialCountryCurrencies),
    [initialCurrencies, initialCountryCurrencies]
  );
  const featuredCountries = useMemo(() => getFeaturedCountries(countries), [countries]);
  const activeCountries = useMemo(() => getSelectableActiveCountries(countries), [countries]);
  const remainingCountries = useMemo(() => getRemainingCountries(countries), [countries]);
  const regions = useMemo(
    () =>
      [...new Set(countries.map((country) => country.region || 'Unspecified'))].sort((left, right) =>
        left.localeCompare(right)
      ),
    [countries]
  );

  const filteredCountries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return [...countries]
      .sort(compareCountriesByName)
      .filter((country) => {
        if (filter === 'active' && !country.isActive) return false;
        if (filter === 'inactive' && country.isActive) return false;
        if (filter === 'featured' && !country.isFeatured) return false;

        const regionName = country.region || 'Unspecified';
        if (regionFilter !== 'all' && regionName !== regionFilter) return false;

        const countryCurrencies = currenciesByCountry.get(country.isoAlpha2) ?? [];
        const currencyCodes = countryCurrencies.map((currency) => currency.code.toLowerCase());

        if (!normalizedSearch) return true;

        return (
          country.name.toLowerCase().includes(normalizedSearch) ||
          country.isoAlpha2.toLowerCase().includes(normalizedSearch) ||
          country.isoAlpha3.toLowerCase().includes(normalizedSearch) ||
          (country.callingCode || '').toLowerCase().includes(normalizedSearch) ||
          currencyCodes.some((code) => code.includes(normalizedSearch))
        );
      });
  }, [countries, currenciesByCountry, filter, regionFilter, search]);

  const hasUnsavedChanges = serializeCountries(countries) !== serializeCountries(baselineCountries);

  const updateCountry = (countryCode: string, updater: (country: CountryReference) => CountryReference) => {
    setCountries((current) =>
      current.map((country) => (country.isoAlpha2 === countryCode ? updater(country) : country))
    );
    setSaveState('idle');
  };

  const handleActiveToggle = (countryCode: string) => {
    updateCountry(countryCode, (country) => {
      const nextActive = !country.isActive;
      return {
        ...country,
        isActive: nextActive,
        isFeatured: nextActive ? country.isFeatured : false,
        featuredSortOrder: nextActive ? country.featuredSortOrder : 999,
      };
    });
  };

  const handleFeaturedToggle = (countryCode: string) => {
    updateCountry(countryCode, (country) => {
      if (country.isFeatured) {
        return {
          ...country,
          isFeatured: false,
          featuredSortOrder: 999,
        };
      }

      return {
        ...country,
        isActive: true,
        isFeatured: true,
        featuredSortOrder: getNextFeaturedSortOrder(countries.filter((entry) => entry.isoAlpha2 !== country.isoAlpha2)),
      };
    });
  };

  const handleFeaturedOrderChange = (countryCode: string, value: string) => {
    const parsedValue = Number.parseInt(value, 10);
    updateCountry(countryCode, (country) => ({
      ...country,
      isActive: true,
      isFeatured: true,
      featuredSortOrder: Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : country.featuredSortOrder,
    }));
  };

  const validateBeforeSave = () => {
    const featured = countries.filter((country) => country.isFeatured);
    const orders = featured.map((country) => country.featuredSortOrder);

    if (featured.some((country) => !country.isActive)) {
      return 'Featured countries must remain active.';
    }

    if (orders.some((order) => !Number.isInteger(order) || order < 1)) {
      return 'Every featured country must use a positive featured order.';
    }

    if (new Set(orders).size !== orders.length) {
      return 'Featured country order values must be unique.';
    }

    return null;
  };

  const handleSave = async () => {
    const validationError = validateBeforeSave();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const changedCountries = countries.filter((country) => {
      const baseline = baselineCountries.find((entry) => entry.isoAlpha2 === country.isoAlpha2);
      return (
        baseline &&
        (baseline.isActive !== country.isActive ||
          baseline.isFeatured !== country.isFeatured ||
          baseline.featuredSortOrder !== country.featuredSortOrder)
      );
    });

    setIsSaving(true);

    try {
      if (changedCountries.length > 0) {
        const supabase = createClient();
        const results = await Promise.all(
          changedCountries.map((country) =>
            supabase
              .from('countries')
              .update({
                is_active: country.isActive,
                is_featured: country.isFeatured,
                featured_sort_order: country.isFeatured ? country.featuredSortOrder : 999,
              })
              .eq('iso_alpha2', country.isoAlpha2)
          )
        );

        const failed = results.find((result) => result.error);
        if (failed?.error) throw failed.error;
      }

      setBaselineCountries(countries);
      setSaveState('saved');
      toast.success('Country settings saved');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save country settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-section gap-5 lg:gap-6">
      <PageHeader
        title="Countries & Phone Codes"
        description="Manage active countries, featured order, and the normalized country reference set used for future onboarding and phone selectors."
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
        title="Featured Countries"
        description="Featured countries appear first in future onboarding, settings, and phone selectors. They must remain active and use unique featured order values."
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            {featuredCountries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                No featured countries yet. Use the featured toggle below to pin countries to the top of the selector.
              </div>
            ) : (
              featuredCountries.map((country) => {
                const defaultCurrency = initialCurrencies.find(
                  (currency) => currency.code === country.defaultCurrencyCode
                );

                return (
                  <div
                    key={country.isoAlpha2}
                    className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3 md:flex-row md:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="text-2xl">{country.flag || '🏳️'}</span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-700 text-foreground">{country.name}</span>
                          <StatusBadge status="info" label="Featured" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {country.isoAlpha2} · {country.callingCode || 'No calling code'} · {defaultCurrency?.code || '—'}
                        </p>
                      </div>
                    </div>
                    <div className="ms-auto flex items-center gap-2">
                      <label className="text-xs font-700 uppercase tracking-[0.14em] text-muted-foreground">
                        Order
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={country.featuredSortOrder}
                        onChange={(event) => handleFeaturedOrderChange(country.isoAlpha2, event.target.value)}
                        className="input-base h-10 w-20 py-2 text-sm"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-700 text-foreground">Future selector preview</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Featured countries appear first, then all remaining active countries alphabetically with no duplication.
            </p>
            <div className="mt-4 space-y-2">
              {activeCountries.slice(0, 8).map((country) => (
                <div
                  key={`preview-${country.isoAlpha2}`}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3"
                >
                  <span className="text-2xl">{country.flag || '🏳️'}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-700 text-foreground">{country.name}</span>
                      {country.isFeatured ? <StatusBadge status="info" label="Featured" /> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {country.isoAlpha2} · {country.callingCode || 'No calling code'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="All Countries"
        description="Search and manage active or featured country records without changing the normalized country-currency mappings in this phase."
      >
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
            <SearchField
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by country name, ISO code, calling code, or currency code..."
            />
            <select
              className="input-base"
              value={regionFilter}
              onChange={(event) => setRegionFilter(event.target.value)}
            >
              <option value="all">All regions</option>
              {regions.map((region) => (
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
                  <th className="px-3 py-2">Country</th>
                  <th className="px-3 py-2">ISO</th>
                  <th className="px-3 py-2">Calling Code</th>
                  <th className="px-3 py-2">Default Currency</th>
                  <th className="px-3 py-2">Region</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2">Featured</th>
                  <th className="px-3 py-2">Featured Order</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredCountries.map((country) => {
                  const defaultCurrency = initialCurrencies.find(
                    (currency) => currency.code === country.defaultCurrencyCode
                  );
                  const countryCurrencies = currenciesByCountry.get(country.isoAlpha2) ?? [];

                  return (
                    <tr key={country.isoAlpha2} className="bg-card shadow-card-sm">
                      <td className="rounded-s-2xl px-3 py-3">
                        <div className="flex min-w-[240px] items-center gap-3">
                          <span className="text-2xl">{country.flag || '🏳️'}</span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-700 text-foreground">{country.name}</span>
                              {country.isFeatured ? <StatusBadge status="info" label="Featured" /> : null}
                            </div>
                            <p className="truncate text-sm text-muted-foreground">
                              {countryCurrencies.map((currency) => currency.code).join(', ') || 'No mapped currency'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-foreground">
                        {country.isoAlpha2} / {country.isoAlpha3}
                      </td>
                      <td className="px-3 py-3 text-sm text-foreground">
                        {country.callingCode || '—'}
                        {country.callingCodeSuffix ? ` ${country.callingCodeSuffix}` : ''}
                      </td>
                      <td className="px-3 py-3 text-sm text-foreground">
                        {defaultCurrency ? `${defaultCurrency.code} · ${defaultCurrency.name}` : '—'}
                      </td>
                      <td className="px-3 py-3 text-sm text-foreground">
                        <div>{country.region || 'Unspecified'}</div>
                        <div className="text-xs text-muted-foreground">{country.subregion || '—'}</div>
                      </td>
                      <td className="px-3 py-3">
                        <ToggleButton
                          checked={country.isActive}
                          onClick={() => handleActiveToggle(country.isoAlpha2)}
                          ariaLabel={`${country.isActive ? 'Disable' : 'Enable'} ${country.name}`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <ToggleButton
                          checked={country.isFeatured}
                          onClick={() => handleFeaturedToggle(country.isoAlpha2)}
                          ariaLabel={`${country.isFeatured ? 'Unfeature' : 'Feature'} ${country.name}`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min={1}
                          value={country.isFeatured ? country.featuredSortOrder : ''}
                          onChange={(event) => handleFeaturedOrderChange(country.isoAlpha2, event.target.value)}
                          disabled={!country.isFeatured}
                          className="input-base h-10 w-24 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </td>
                      <td className="rounded-e-2xl px-3 py-3">
                        <StatusBadge
                          status={country.isActive ? 'ready' : 'warning'}
                          label={country.isActive ? 'Active' : 'Inactive'}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredCountries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              No countries match the current filters.
            </div>
          ) : null}
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Ordering Rules"
          description="Featured countries stay at the top. Remaining active countries continue alphabetically by name."
        >
          <div className="space-y-2">
            {featuredCountries.slice(0, 5).map((country) => (
              <div
                key={`ordered-${country.isoAlpha2}`}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
              >
                <span className="text-2xl">{country.flag || '🏳️'}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-700 text-foreground">{country.name}</span>
                    <StatusBadge status="info" label="Featured" />
                  </div>
                  <p className="text-sm text-muted-foreground">{country.callingCode || 'No calling code'}</p>
                </div>
              </div>
            ))}
            {remainingCountries
              .filter((country) => country.isActive)
              .slice(0, 4)
              .map((country) => (
                <div
                  key={`remaining-${country.isoAlpha2}`}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
                >
                  <span className="text-2xl">{country.flag || '🏳️'}</span>
                  <div className="min-w-0">
                    <span className="text-sm font-700 text-foreground">{country.name}</span>
                    <p className="text-sm text-muted-foreground">{country.callingCode || 'No calling code'}</p>
                  </div>
                </div>
              ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Administrative Rules"
          description="This phase reads country-currency mappings but does not edit them."
        >
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>Featured countries are forced to remain active.</li>
            <li>Inactive countries are automatically unfeatured.</li>
            <li>Only the country activity and featured metadata are editable here.</li>
            <li>Country-currency mappings remain read-only in this phase.</li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
