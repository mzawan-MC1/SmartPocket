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
  showFeaturedBadge = false,
  showActiveStatus = false,
  selected = false,
  onClick,
  trailing,
  className = '',
}: CurrencyOptionRowProps) {
  const content = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          <CurrencySymbol currency={currency} size="xs" />
          <span className={`text-sm font-700 ${selected ? 'selector-value-primary' : 'text-foreground'}`}>{currency.code}</span>
        </div>
        <span className={`min-w-0 flex-1 truncate text-sm ${selected ? 'selector-value-secondary' : 'text-muted-foreground'}`}>
          {currency.name}
        </span>
        {showFeaturedBadge && currency.isFeatured ? <StatusBadge status="info" label="Featured" /> : null}
        {showActiveStatus ? (
          <StatusBadge
            status={currency.isActive ? 'ready' : 'warning'}
            label={currency.isActive ? 'Active' : 'Inactive'}
          />
        ) : null}
      </div>
      {trailing ? <div className="ms-2 flex shrink-0 items-center">{trailing}</div> : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`selector-option flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
          selected
            ? 'selector-option-selected'
            : ''
        } ${className}`.trim()}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={`selector-option flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 ${
        selected ? 'selector-option-selected' : ''
      } ${className}`.trim()}
    >
      {content}
    </div>
  );
}
