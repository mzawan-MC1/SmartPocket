import React from 'react';
import CurrencySymbol from '@/components/currency/CurrencySymbol';
import StatusBadge from '@/components/ui/StatusBadge';
import type { CurrencyReference } from '@/lib/reference-data/types';

interface CurrencyOptionRowProps {
  currency: CurrencyReference;
  countryCount?: number;
  showCountryCount?: boolean;
  showFeaturedBadge?: boolean;
  showActiveStatus?: boolean;
  selected?: boolean;
  onClick?: () => void;
  trailing?: React.ReactNode;
  className?: string;
}

export default function CurrencyOptionRow({
  currency,
  countryCount,
  showCountryCount = false,
  showFeaturedBadge = false,
  showActiveStatus = false,
  selected = false,
  onClick,
  trailing,
  className = '',
}: CurrencyOptionRowProps) {
  const content = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted/70">
          <CurrencySymbol currency={currency} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-700 text-foreground">{currency.code}</span>
            {showFeaturedBadge && currency.isFeatured ? <StatusBadge status="info" label="Featured" /> : null}
            {showActiveStatus ? (
              <StatusBadge
                status={currency.isActive ? 'ready' : 'warning'}
                label={currency.isActive ? 'Active' : 'Inactive'}
              />
            ) : null}
          </div>
          <p className="truncate text-sm text-muted-foreground">{currency.name}</p>
        </div>
      </div>
      <div className="ms-auto flex shrink-0 items-center gap-3">
        {showCountryCount ? (
          <span className="text-xs font-600 text-muted-foreground">
            {typeof countryCount === 'number' ? `${countryCount} countries` : 'No countries'}
          </span>
        ) : null}
        {trailing}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
          selected
            ? 'border-accent bg-accent/5 shadow-card-sm'
            : 'border-border bg-card hover:border-accent/40 hover:bg-muted/30'
        } ${className}`.trim()}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 ${
        selected ? 'border-accent bg-accent/5 shadow-card-sm' : ''
      } ${className}`.trim()}
    >
      {content}
    </div>
  );
}
