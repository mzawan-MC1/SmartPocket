'use client';

import React, { useMemo, useState } from 'react';
import type { CurrencyReference } from '@/lib/reference-data/types';
import { getRichCurrencyToken } from '@/lib/currency-formatting';

type CurrencySymbolSize = 'compact' | 'normal';

interface CurrencySymbolProps {
  currency: Pick<
    CurrencyReference,
    'code' | 'name' | 'symbol' | 'narrowSymbol' | 'fallbackSymbol' | 'symbolType' | 'symbolAssetPath'
  >;
  size?: CurrencySymbolSize;
  textOnly?: boolean;
  className?: string;
  textClassName?: string;
  ariaLabel?: string;
}

const SIZE_STYLES: Record<CurrencySymbolSize, { container: string; image: string; text: string }> = {
  compact: {
    container: 'h-5 min-w-5',
    image: 'max-h-4 max-w-5',
    text: 'text-sm font-700 leading-none',
  },
  normal: {
    container: 'h-7 min-w-7',
    image: 'max-h-6 max-w-7',
    text: 'text-base font-700 leading-none',
  },
};

function getAccessibleLabel(currency: CurrencySymbolProps['currency']) {
  return `${currency.name} symbol`;
}

export default function CurrencySymbol({
  currency,
  size = 'normal',
  textOnly = false,
  className = '',
  textClassName = '',
  ariaLabel,
}: CurrencySymbolProps) {
  const [assetFailed, setAssetFailed] = useState(false);

  const styles = SIZE_STYLES[size];
  const accessibleLabel = ariaLabel || getAccessibleLabel(currency);
  const fallbackText = useMemo(() => {
    return getRichCurrencyToken({
      code: currency.code,
      symbol: currency.symbol,
      narrowSymbol: currency.narrowSymbol,
      fallbackSymbol: currency.fallbackSymbol,
      symbolType: currency.symbolType,
    });
  }, [currency]);

  const shouldRenderAsset =
    !textOnly &&
    !assetFailed &&
    currency.symbolType === 'asset' &&
    typeof currency.symbolAssetPath === 'string' &&
    currency.symbolAssetPath.trim().length > 0;

  if (shouldRenderAsset) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center align-middle ${styles.container} ${className}`.trim()}
        role="img"
        aria-label={accessibleLabel}
      >
        <img
          src={currency.symbolAssetPath!}
          alt=""
          aria-hidden="true"
          className={`h-auto w-auto object-contain ${styles.image}`.trim()}
          onError={() => setAssetFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center align-middle ${styles.container} ${className}`.trim()}
      role="img"
      aria-label={accessibleLabel}
    >
      <span className={`${styles.text} ${textClassName}`.trim()}>{fallbackText}</span>
    </span>
  );
}
