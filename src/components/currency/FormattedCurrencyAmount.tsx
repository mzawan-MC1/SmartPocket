'use client';

import React, { useMemo } from 'react';
import CurrencySymbol, { type CurrencySymbolSize } from '@/components/currency/CurrencySymbol';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { getCurrencyByCode } from '@/lib/reference-data/lookups';
import {
  formatCurrencyText,
  formatCurrencyValue,
  type CurrencyDisplayMode,
} from '@/lib/currency-formatting';

interface FormattedCurrencyAmountProps {
  amount: number;
  currencyCode?: string | null;
  locale?: string;
  displayMode?: CurrencyDisplayMode;
  size?: CurrencySymbolSize;
  compact?: boolean;
  textOnly?: boolean;
  fallbackCurrencyCode?: string;
  className?: string;
  numberClassName?: string;
  codeClassName?: string;
  symbolClassName?: string;
  showCode?: boolean;
}

const SIZE_STYLES: Record<CurrencySymbolSize, { gapEm: number }> = {
  xs: { gapEm: 0.14 },
  sm: { gapEm: 0.16 },
  md: { gapEm: 0.18 },
  lg: { gapEm: 0.2 },
  xl: { gapEm: 0.22 },
};

export default function FormattedCurrencyAmount({
  amount,
  currencyCode,
  locale,
  displayMode = 'auto',
  size,
  compact = false,
  textOnly = false,
  fallbackCurrencyCode,
  className = '',
  numberClassName = '',
  symbolClassName = '',
}: FormattedCurrencyAmountProps) {
  const { data } = useClientReferenceData();
  const currencies = data?.snapshot.currencies ?? [];

  const currency = useMemo(
    () => getCurrencyByCode(currencies, currencyCode || fallbackCurrencyCode),
    [currencies, currencyCode, fallbackCurrencyCode]
  );
  const resolvedSize = size || (compact ? 'sm' : 'md');
  const layoutStyles = SIZE_STYLES[resolvedSize];

  if (textOnly) {
    return (
      <span className={className}>
        {formatCurrencyText(amount, {
          currency,
          currencies,
          currencyCode,
          fallbackCurrencyCode,
          locale,
          compact,
        })}
      </span>
    );
  }

  const formatted = formatCurrencyValue(amount, {
    currency,
    currencies,
    currencyCode,
    fallbackCurrencyCode,
    locale,
    compact,
    displayMode,
  });

  if (!currency || formatted.usesCodeToken) {
    return <span className={className}>{formatted.text}</span>;
  }

  return (
    <span
      className={`inline-flex items-baseline leading-none ${className}`.trim()}
      style={{ gap: `${layoutStyles.gapEm}em` }}
    >
      {formatted.sign ? (
        <span className={numberClassName} style={{ lineHeight: 1 }}>
          -
        </span>
      ) : null}
      <CurrencySymbol currency={currency} size={resolvedSize} className={symbolClassName} />
      <bdi dir="ltr" className={numberClassName} style={{ lineHeight: 1 }}>
        {formatted.numberText}
      </bdi>
    </span>
  );
}
