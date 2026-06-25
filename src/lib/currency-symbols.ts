import type { CurrencyReference } from '@/lib/reference-data/types';

export const AED_TRANSPARENT_SYMBOL_ASSET_PATH = '/currencies/aed-dirham-symbol.svg';

type CurrencySymbolSource = Pick<CurrencyReference, 'code' | 'symbolAssetPath'>;

export function isAedCurrency(currency: CurrencySymbolSource | null | undefined) {
  return currency?.code === 'AED';
}

export function resolveCurrencySymbolAssetPath(currency: CurrencySymbolSource | null | undefined) {
  if (!currency) return null;

  if (isAedCurrency(currency)) {
    return AED_TRANSPARENT_SYMBOL_ASSET_PATH;
  }

  const assetPath = currency.symbolAssetPath?.trim();
  return assetPath ? assetPath : null;
}
