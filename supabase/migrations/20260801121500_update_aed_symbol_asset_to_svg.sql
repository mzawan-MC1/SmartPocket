-- Point live AED currency metadata at the transparent SVG asset used by the shared UI renderer.
UPDATE public.currency_registry
SET
  symbol_asset_path = '/currencies/aed-dirham-symbol.svg',
  symbol_type = 'asset'
WHERE UPPER(BTRIM(code)) = 'AED';
