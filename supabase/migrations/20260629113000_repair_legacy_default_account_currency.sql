-- Migration: Repair legacy wrong default personal account currency
-- Timestamp: 20260629113000
--
-- Why this exists:
-- - Earlier database defaults could seed legacy system-created personal Cash/Bank
--   accounts with the wrong stored currency for some users.
-- - Future users are already fixed by later default-currency changes.
-- - This migration repairs only existing legacy default personal accounts that are
--   still unused and still safe to rewrite.
--
-- Safety:
-- - Only touches system-created default personal accounts:
--   is_system_default = true and system_default_type in ('personal_cash', 'personal_bank').
-- - Only touches zero-balance accounts:
--   opening_balance = 0 and current_balance = 0.
-- - Only touches unused accounts:
--   zero linked transactions, zero linked transfers, and zero linked recurring rows.
-- - Only touches personal-scope rows:
--   ownership_type = 'personal', scope_type = 'personal', space_id is null, is_active = true.
-- - Only repairs rows where the stored account currency differs from a valid
--   user_profiles.default_currency.
-- - No historical ledger/account with activity is touched.
-- - Does not modify transactions, transfers, recurring rows, spaces, or non-default accounts.
-- - The UPDATE is idempotent and re-checks currency difference before writing.
--
-- Preview before update:
-- WITH candidate_accounts AS (
--   SELECT
--     fa.id,
--     fa.user_id,
--     fa.name,
--     fa.account_type,
--     fa.system_default_type,
--     UPPER(BTRIM(COALESCE(fa.currency, ''))) AS account_currency,
--     UPPER(BTRIM(COALESCE(up.default_currency, ''))) AS target_currency,
--     COALESCE(fa.opening_balance, 0) AS opening_balance,
--     COALESCE(fa.current_balance, 0) AS current_balance,
--     tx.tx_count,
--     tf.transfer_count,
--     rt.recurring_count,
--     fa.created_at,
--     fa.updated_at
--   FROM public.financial_accounts AS fa
--   JOIN public.user_profiles AS up
--     ON up.id = fa.user_id
--   CROSS JOIN LATERAL (
--     SELECT COUNT(*)::BIGINT AS tx_count
--     FROM public.transactions AS t
--     WHERE t.account_id = fa.id
--   ) AS tx
--   CROSS JOIN LATERAL (
--     SELECT COUNT(*)::BIGINT AS transfer_count
--     FROM public.transfers AS tr
--     WHERE tr.from_account_id = fa.id
--        OR tr.to_account_id = fa.id
--   ) AS tf
--   CROSS JOIN LATERAL (
--     SELECT COUNT(*)::BIGINT AS recurring_count
--     FROM public.recurring_transactions AS rt
--     WHERE rt.account_id = fa.id
--   ) AS rt
--   WHERE COALESCE(fa.is_system_default, FALSE) = TRUE
--     AND fa.system_default_type IN ('personal_cash', 'personal_bank')
--     AND COALESCE(fa.ownership_type, 'personal') = 'personal'
--     AND COALESCE(fa.scope_type, 'personal') = 'personal'
--     AND fa.space_id IS NULL
--     AND COALESCE(fa.is_active, TRUE) = TRUE
--     AND COALESCE(fa.opening_balance, 0) = 0
--     AND COALESCE(fa.current_balance, 0) = 0
--     AND UPPER(BTRIM(COALESCE(up.default_currency, ''))) ~ '^[A-Z]{3}$'
--     AND UPPER(BTRIM(COALESCE(up.default_currency, ''))) IS DISTINCT FROM UPPER(BTRIM(COALESCE(fa.currency, '')))
--     AND tx.tx_count = 0
--     AND tf.transfer_count = 0
--     AND rt.recurring_count = 0
-- )
-- SELECT
--   id,
--   user_id,
--   name,
--   account_type,
--   system_default_type,
--   account_currency,
--   target_currency,
--   opening_balance,
--   current_balance,
--   tx_count,
--   transfer_count,
--   recurring_count,
--   created_at,
--   updated_at
-- FROM candidate_accounts
-- ORDER BY user_id, system_default_type, created_at, id;
--
-- Rollback instructions:
-- - This migration is intended to be applied manually through the normal Supabase
--   migration pipeline after previewing the candidate set.
-- - Before applying in any environment that needs rollback, export the preview
--   result set with id + account_currency so you have a point-in-time snapshot of
--   the pre-repair values.
-- - If rollback is ever required, restore only the exported account ids back to
--   their captured pre-repair currency values with a manual UPDATE.

WITH candidate_accounts AS (
  SELECT
    fa.id,
    UPPER(BTRIM(COALESCE(up.default_currency, ''))) AS target_currency
  FROM public.financial_accounts AS fa
  JOIN public.user_profiles AS up
    ON up.id = fa.user_id
  WHERE COALESCE(fa.is_system_default, FALSE) = TRUE
    AND fa.system_default_type IN ('personal_cash', 'personal_bank')
    AND COALESCE(fa.ownership_type, 'personal') = 'personal'
    AND COALESCE(fa.scope_type, 'personal') = 'personal'
    AND fa.space_id IS NULL
    AND COALESCE(fa.is_active, TRUE) = TRUE
    AND COALESCE(fa.opening_balance, 0) = 0
    AND COALESCE(fa.current_balance, 0) = 0
    AND UPPER(BTRIM(COALESCE(up.default_currency, ''))) ~ '^[A-Z]{3}$'
    AND UPPER(BTRIM(COALESCE(up.default_currency, ''))) IS DISTINCT FROM UPPER(BTRIM(COALESCE(fa.currency, '')))
    AND NOT EXISTS (
      SELECT 1
      FROM public.transactions AS t
      WHERE t.account_id = fa.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.transfers AS tr
      WHERE tr.from_account_id = fa.id
         OR tr.to_account_id = fa.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.recurring_transactions AS rt
      WHERE rt.account_id = fa.id
    )
)
SELECT COUNT(*) AS accounts_to_repair
FROM candidate_accounts;

WITH candidate_accounts AS (
  SELECT
    fa.id,
    UPPER(BTRIM(COALESCE(up.default_currency, ''))) AS target_currency
  FROM public.financial_accounts AS fa
  JOIN public.user_profiles AS up
    ON up.id = fa.user_id
  WHERE COALESCE(fa.is_system_default, FALSE) = TRUE
    AND fa.system_default_type IN ('personal_cash', 'personal_bank')
    AND COALESCE(fa.ownership_type, 'personal') = 'personal'
    AND COALESCE(fa.scope_type, 'personal') = 'personal'
    AND fa.space_id IS NULL
    AND COALESCE(fa.is_active, TRUE) = TRUE
    AND COALESCE(fa.opening_balance, 0) = 0
    AND COALESCE(fa.current_balance, 0) = 0
    AND UPPER(BTRIM(COALESCE(up.default_currency, ''))) ~ '^[A-Z]{3}$'
    AND UPPER(BTRIM(COALESCE(up.default_currency, ''))) IS DISTINCT FROM UPPER(BTRIM(COALESCE(fa.currency, '')))
    AND NOT EXISTS (
      SELECT 1
      FROM public.transactions AS t
      WHERE t.account_id = fa.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.transfers AS tr
      WHERE tr.from_account_id = fa.id
         OR tr.to_account_id = fa.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.recurring_transactions AS rt
      WHERE rt.account_id = fa.id
    )
)
UPDATE public.financial_accounts AS fa
SET currency = ca.target_currency,
    updated_at = NOW()
FROM candidate_accounts AS ca
WHERE fa.id = ca.id
  AND fa.currency IS DISTINCT FROM ca.target_currency;
