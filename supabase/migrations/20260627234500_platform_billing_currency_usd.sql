BEGIN;

-- Billing-only currency shift from legacy AED to canonical USD.
-- Intentionally does not touch platform_settings.default_currency or any
-- personal-finance account / transaction currency columns.

ALTER TABLE public.platform_settings
  ALTER COLUMN pdf_currency SET DEFAULT 'USD';

UPDATE public.platform_settings
SET pdf_currency = 'USD'
WHERE pdf_currency IS NULL
   OR btrim(pdf_currency) = ''
   OR upper(btrim(pdf_currency)) = 'AED';

UPDATE public.ai_topup_products
SET currency_code = 'USD'
WHERE upper(btrim(currency_code)) = 'AED';

UPDATE public.ai_topup_orders
SET currency_code = 'USD'
WHERE upper(btrim(currency_code)) = 'AED';

UPDATE public.ai_topup_order_items
SET currency_code = 'USD'
WHERE upper(btrim(currency_code)) = 'AED';

COMMIT;
