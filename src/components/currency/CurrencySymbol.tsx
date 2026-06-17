'use client';

import React, { useMemo, useState } from 'react';
import type { CurrencyReference } from '@/lib/reference-data/types';
import { getRichCurrencyToken } from '@/lib/currency-formatting';

export type CurrencySymbolSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

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

const SIZE_STYLES: Record<
  CurrencySymbolSize,
  {
    minWidthEm: number;
    assetHeightEm: number;
    assetMaxWidthEm: number;
    textScaleEm: number;
    baselineNudgeEm: number;
  }
> = {
  xs: {
    minWidthEm: 0.72,
    assetHeightEm: 0.82,
    assetMaxWidthEm: 1.02,
    textScaleEm: 0.92,
    baselineNudgeEm: 0.02,
  },
  sm: {
    minWidthEm: 0.76,
    assetHeightEm: 0.86,
    assetMaxWidthEm: 1.08,
    textScaleEm: 0.94,
    baselineNudgeEm: 0.018,
  },
  md: {
    minWidthEm: 0.8,
    assetHeightEm: 0.9,
    assetMaxWidthEm: 1.16,
    textScaleEm: 0.96,
    baselineNudgeEm: 0.016,
  },
  lg: {
    minWidthEm: 0.84,
    assetHeightEm: 0.93,
    assetMaxWidthEm: 1.22,
    textScaleEm: 0.98,
    baselineNudgeEm: 0.014,
  },
  xl: {
    minWidthEm: 0.88,
    assetHeightEm: 0.95,
    assetMaxWidthEm: 1.28,
    textScaleEm: 1,
    baselineNudgeEm: 0.012,
  },
};

function getAccessibleLabel(currency: CurrencySymbolProps['currency']) {
  return `${currency.name} symbol`;
}

export default function CurrencySymbol({
  currency,
  size = 'md',
  textOnly = false,
  className = '',
  textClassName = '',
  ariaLabel,
}: CurrencySymbolProps) {
  const [assetFailed, setAssetFailed] = useState(false);

  const styles = SIZE_STYLES[size] ?? SIZE_STYLES.md;
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
        className={`inline-flex shrink-0 self-baseline items-end justify-center leading-none ${className}`.trim()}
        role="img"
        aria-label={accessibleLabel}
        style={{
          minWidth: `${styles.minWidthEm}em`,
          transform: `translateY(${styles.baselineNudgeEm}em)`,
        }}
      >
        <img
          src={currency.symbolAssetPath!}
          alt=""
          aria-hidden="true"
          className="block object-contain"
          style={{
            height: `${styles.assetHeightEm}em`,
            width: 'auto',
            maxWidth: `${styles.assetMaxWidthEm}em`,
          }}
          onError={() => setAssetFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 self-baseline items-end justify-center leading-none ${className}`.trim()}
      role="img"
      aria-label={accessibleLabel}
      style={{
        minWidth: `${styles.minWidthEm}em`,
        transform: `translateY(${styles.baselineNudgeEm}em)`,
      }}
    >
      <span
        className={textClassName}
        style={{
          fontSize: `${styles.textScaleEm}em`,
          lineHeight: 1,
          fontWeight: 'inherit',
        }}
      >
        {fallbackText}
      </span>
    </span>
  );
}
