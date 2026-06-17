'use client';

import React, { useMemo } from 'react';
import CurrencySymbol from '@/components/currency/CurrencySymbol';
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
  compact?: boolean;
  textOnly?: boolean;
  fallbackCurrencyCode?: string;
  className?: string;
  numberClassName?: string;
  codeClassName?: string;
  symbolClassName?: string;
  showCode?: boolean;
}

export default function FormattedCurrencyAmount({
  amount,
  currencyCode,
  locale,
  displayMode = 'auto',
  compact = false,
  textOnly = false,
  fallbackCurrencyCode,
  className = '',
  numberClassName = '',
  codeClassName = '',
  symbolClassName = '',
  showCode = false,
}: FormattedCurrencyAmountProps) {
  const { data } = useClientReferenceData();
  const currencies = data?.snapshot.currencies ?? [];

  const currency = useMemo(
    () => getCurrencyByCode(currencies, currencyCode || fallbackCurrencyCode),
    [currencies, currencyCode, fallbackCurrencyCode]
  );

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

  const shouldShowCode = showCode && currency.symbolType !== 'asset';

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`.trim()}>
      {formatted.sign ? <span className={numberClassName}>-</span> : null}
      <CurrencySymbol currency={currency} className={symbolClassName} />
      <bdi dir="ltr" className={numberClassName}>
        {formatted.numberText}
      </bdi>
      {shouldShowCode ? (
        <span className={`text-[0.8em] text-muted-foreground ${codeClassName}`.trim()}>
          {formatted.code}
        </span>
      ) : null}
    </span>
  );
}
