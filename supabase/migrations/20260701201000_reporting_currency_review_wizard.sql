CREATE OR REPLACE FUNCTION public.rpc_change_reporting_currency_with_account_review(
  p_actor_user_id UUID,
  p_previous_reporting_currency TEXT,
  p_new_reporting_currency TEXT,
  p_account_actions JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id UUID := auth.uid();
  v_user_id UUID := COALESCE(p_actor_user_id, v_auth_user_id);
  v_accounts_changed_message TEXT := 'Your accounts changed while you were reviewing them. Please review the updated account list before confirming again.';
  v_previous_reporting_currency TEXT := UPPER(BTRIM(COALESCE(p_previous_reporting_currency, '')));
  v_new_reporting_currency TEXT := UPPER(BTRIM(COALESCE(p_new_reporting_currency, '')));
  v_saved_reporting_currency TEXT;
  v_reporting_currency_minor_units INTEGER;
  v_action_row JSONB;
  v_action_type TEXT;
  v_raw_account_id TEXT;
  v_raw_action TEXT;
  v_raw_source_currency TEXT;
  v_raw_target_currency TEXT;
  v_raw_expected_source_balance TEXT;
  v_raw_expected_converted_amount TEXT;
  v_raw_exchange_rate_snapshot_id TEXT;
  v_raw_confirmation_checked TEXT;
  v_raw_direct_update_allowed TEXT;
  v_account_id UUID;
  v_action TEXT;
  v_source_currency TEXT;
  v_target_currency TEXT;
  v_expected_source_balance NUMERIC;
  v_expected_converted_amount NUMERIC;
  v_exchange_rate_snapshot_id UUID;
  v_confirmation_checked BOOLEAN;
  v_direct_update_allowed BOOLEAN;
  v_account public.financial_accounts%ROWTYPE;
  v_actual_balance NUMERIC;
  v_expected_account_ids UUID[] := ARRAY[]::UUID[];
  v_seen_account_ids UUID[] := ARRAY[]::UUID[];
  v_expected_account_count INTEGER := 0;
  v_seen_account_count INTEGER := 0;
  v_missing_account_count INTEGER := 0;
  v_unknown_account_count INTEGER := 0;
  v_result_row RECORD;
  v_result_json JSONB;
  v_accounts JSONB := '[]'::jsonb;
  v_converted_accounts_count INTEGER := 0;
  v_kept_accounts_count INTEGER := 0;
  v_corrected_accounts_count INTEGER := 0;
  v_archived_accounts_count INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_auth_user_id IS NOT NULL
     AND p_actor_user_id IS NOT NULL
     AND v_auth_user_id <> p_actor_user_id THEN
    RAISE EXCEPTION 'Actor mismatch';
  END IF;

  IF v_previous_reporting_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Previous reporting currency must be a valid three-letter currency code';
  END IF;

  IF v_new_reporting_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'New reporting currency must be a valid three-letter currency code';
  END IF;

  IF v_previous_reporting_currency = v_new_reporting_currency THEN
    RAISE EXCEPTION 'Choose a different reporting currency';
  END IF;

  IF COALESCE(jsonb_typeof(p_account_actions), 'null') <> 'array' THEN
    RAISE EXCEPTION 'Review the latest account changes before confirming.';
  END IF;

  SELECT UPPER(BTRIM(COALESCE(default_currency, '')))
  INTO v_saved_reporting_currency
  FROM public.user_profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF v_saved_reporting_currency IS DISTINCT FROM v_previous_reporting_currency THEN
    RAISE EXCEPTION 'The reporting currency changed after the preview. Review the updated values before confirming again.';
  END IF;

  SELECT minor_units
  INTO v_reporting_currency_minor_units
  FROM public.currency_registry
  WHERE code = v_new_reporting_currency
    AND is_active = TRUE
  LIMIT 1;

  IF v_reporting_currency_minor_units IS NULL THEN
    RAISE EXCEPTION 'The selected reporting currency is unavailable.';
  END IF;

  SELECT
    COALESCE(array_agg(expected_accounts.id ORDER BY expected_accounts.id), ARRAY[]::UUID[]),
    COUNT(*)
  INTO v_expected_account_ids, v_expected_account_count
  FROM (
    SELECT id
    FROM public.financial_accounts
    WHERE user_id = v_user_id
      AND COALESCE(is_active, FALSE) = TRUE
      AND COALESCE(ownership_type, 'personal') = 'personal'
      AND (scope_type IS NULL OR scope_type = 'personal')
      AND space_id IS NULL
    FOR UPDATE
  ) AS expected_accounts;

  FOR v_action_row IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_account_actions, '[]'::jsonb))
  LOOP
    v_action_type := jsonb_typeof(v_action_row);
    IF v_action_type IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Review the latest account changes before confirming.';
    END IF;

    v_raw_account_id := NULLIF(BTRIM(COALESCE(v_action_row->>'account_id', '')), '');
    v_raw_action := BTRIM(COALESCE(v_action_row->>'action', ''));
    v_raw_source_currency := UPPER(BTRIM(COALESCE(v_action_row->>'source_currency', '')));
    v_raw_target_currency := UPPER(BTRIM(COALESCE(v_action_row->>'target_currency', '')));
    v_raw_expected_source_balance := NULLIF(BTRIM(COALESCE(v_action_row->>'expected_source_balance', '')), '');
    v_raw_expected_converted_amount := NULLIF(BTRIM(COALESCE(v_action_row->>'expected_converted_amount', '')), '');
    v_raw_exchange_rate_snapshot_id := NULLIF(BTRIM(COALESCE(v_action_row->>'exchange_rate_snapshot_id', '')), '');
    v_raw_confirmation_checked := NULLIF(BTRIM(COALESCE(v_action_row->>'confirmation_checked', '')), '');
    v_raw_direct_update_allowed := NULLIF(BTRIM(COALESCE(v_action_row->>'direct_update_allowed', '')), '');

    IF v_raw_account_id IS NULL THEN
      RAISE EXCEPTION 'Each reviewed account must include an account id';
    END IF;

    IF v_raw_account_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Each reviewed account must include a valid account id';
    END IF;
    v_account_id := v_raw_account_id::UUID;

    IF v_account_id = ANY(v_seen_account_ids) THEN
      RAISE EXCEPTION 'The same account was reviewed more than once. Please review the updated account list before confirming again.';
    END IF;
    v_seen_account_ids := array_append(v_seen_account_ids, v_account_id);
    v_seen_account_count := v_seen_account_count + 1;

    IF v_raw_action NOT IN ('keep', 'correction', 'conversion') THEN
      RAISE EXCEPTION 'Unsupported reviewed account action';
    END IF;
    v_action := v_raw_action;

    IF v_raw_source_currency !~ '^[A-Z]{3}$' OR v_raw_target_currency !~ '^[A-Z]{3}$' THEN
      RAISE EXCEPTION 'Each reviewed account must include valid source and target currencies';
    END IF;
    v_source_currency := v_raw_source_currency;
    v_target_currency := v_raw_target_currency;

    IF v_raw_expected_source_balance IS NOT NULL
       AND v_raw_expected_source_balance !~ '^[-+]?[0-9]+(\.[0-9]+)?$' THEN
      RAISE EXCEPTION 'Each reviewed account must include a valid expected source balance';
    END IF;
    v_expected_source_balance := v_raw_expected_source_balance::NUMERIC;

    IF v_raw_expected_converted_amount IS NOT NULL
       AND v_raw_expected_converted_amount !~ '^[-+]?[0-9]+(\.[0-9]+)?$' THEN
      RAISE EXCEPTION 'Each reviewed account must include a valid expected converted amount';
    END IF;
    v_expected_converted_amount := v_raw_expected_converted_amount::NUMERIC;

    IF v_raw_exchange_rate_snapshot_id IS NOT NULL THEN
      IF v_raw_exchange_rate_snapshot_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'Each reviewed account must include a valid exchange-rate snapshot id';
      END IF;
      v_exchange_rate_snapshot_id := v_raw_exchange_rate_snapshot_id::UUID;
    ELSE
      v_exchange_rate_snapshot_id := NULL;
    END IF;

    IF v_raw_confirmation_checked IS NOT NULL AND v_raw_confirmation_checked NOT IN ('true', 'false') THEN
      RAISE EXCEPTION 'Each reviewed account must include a valid confirmation flag';
    END IF;
    v_confirmation_checked := COALESCE(v_raw_confirmation_checked::BOOLEAN, FALSE);

    IF v_raw_direct_update_allowed IS NOT NULL AND v_raw_direct_update_allowed NOT IN ('true', 'false') THEN
      RAISE EXCEPTION 'Each reviewed account must include a valid direct-update flag';
    END IF;
    v_direct_update_allowed := COALESCE(v_raw_direct_update_allowed::BOOLEAN, FALSE);
  END LOOP;

  SELECT COUNT(*)
  INTO v_missing_account_count
  FROM unnest(v_expected_account_ids) AS expected_id
  WHERE NOT (expected_id = ANY(v_seen_account_ids));

  SELECT COUNT(*)
  INTO v_unknown_account_count
  FROM unnest(v_seen_account_ids) AS seen_id
  WHERE NOT (seen_id = ANY(v_expected_account_ids));

  IF v_seen_account_count <> v_expected_account_count
     OR v_missing_account_count > 0
     OR v_unknown_account_count > 0 THEN
    RAISE EXCEPTION '%', v_accounts_changed_message;
  END IF;

  FOR v_action_row IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_account_actions, '[]'::jsonb))
  LOOP
    v_raw_account_id := NULLIF(BTRIM(COALESCE(v_action_row->>'account_id', '')), '');
    v_raw_action := BTRIM(COALESCE(v_action_row->>'action', ''));
    v_raw_source_currency := UPPER(BTRIM(COALESCE(v_action_row->>'source_currency', '')));
    v_raw_target_currency := UPPER(BTRIM(COALESCE(v_action_row->>'target_currency', '')));
    v_raw_expected_source_balance := NULLIF(BTRIM(COALESCE(v_action_row->>'expected_source_balance', '')), '');
    v_raw_expected_converted_amount := NULLIF(BTRIM(COALESCE(v_action_row->>'expected_converted_amount', '')), '');
    v_raw_exchange_rate_snapshot_id := NULLIF(BTRIM(COALESCE(v_action_row->>'exchange_rate_snapshot_id', '')), '');
    v_raw_confirmation_checked := NULLIF(BTRIM(COALESCE(v_action_row->>'confirmation_checked', '')), '');
    v_raw_direct_update_allowed := NULLIF(BTRIM(COALESCE(v_action_row->>'direct_update_allowed', '')), '');

    v_account_id := v_raw_account_id::UUID;
    v_action := v_raw_action;
    v_source_currency := v_raw_source_currency;
    v_target_currency := v_raw_target_currency;
    v_expected_source_balance := v_raw_expected_source_balance::NUMERIC;
    v_expected_converted_amount := v_raw_expected_converted_amount::NUMERIC;
    v_exchange_rate_snapshot_id := CASE
      WHEN v_raw_exchange_rate_snapshot_id IS NULL THEN NULL
      ELSE v_raw_exchange_rate_snapshot_id::UUID
    END;
    v_confirmation_checked := COALESCE(v_raw_confirmation_checked::BOOLEAN, FALSE);
    v_direct_update_allowed := COALESCE(v_raw_direct_update_allowed::BOOLEAN, FALSE);

    SELECT *
    INTO v_account
    FROM public.financial_accounts
    WHERE id = v_account_id
      AND user_id = v_user_id
      AND COALESCE(is_active, FALSE) = TRUE
      AND COALESCE(ownership_type, 'personal') = 'personal'
      AND (scope_type IS NULL OR scope_type = 'personal')
      AND space_id IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION '%', v_accounts_changed_message;
    END IF;

    IF UPPER(BTRIM(COALESCE(v_account.currency, ''))) IS DISTINCT FROM v_source_currency THEN
      RAISE EXCEPTION 'An account currency changed after the preview. Review the updated values before confirming again.';
    END IF;

    v_actual_balance := public.rpc_recalculate_financial_account_balance(v_account.id);

    IF v_expected_source_balance IS NOT NULL
       AND ABS(COALESCE(v_actual_balance, 0) - v_expected_source_balance) > 0.000001 THEN
      RAISE EXCEPTION 'An account balance changed after the preview. Review the updated values before confirming again.';
    END IF;

    IF v_action = 'keep' THEN
      IF v_target_currency IS DISTINCT FROM v_source_currency THEN
        RAISE EXCEPTION 'Review the updated account choices before confirming.';
      END IF;
      CONTINUE;
    END IF;

    IF v_target_currency IS DISTINCT FROM v_new_reporting_currency THEN
      RAISE EXCEPTION 'Review the updated account choices before confirming.';
    END IF;

    IF v_action = 'correction' THEN
      IF v_confirmation_checked IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Confirm that the eligible amounts were originally entered in the new currency before correcting this account.';
      END IF;
      CONTINUE;
    END IF;

    IF v_expected_source_balance IS NULL OR v_expected_converted_amount IS NULL THEN
      RAISE EXCEPTION 'Review the latest conversion preview before confirming this account conversion.';
    END IF;

    IF v_direct_update_allowed IS DISTINCT FROM TRUE AND v_exchange_rate_snapshot_id IS NULL THEN
      RAISE EXCEPTION 'Review the latest conversion preview before confirming this account conversion.';
    END IF;
  END LOOP;

  FOR v_action_row IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_account_actions, '[]'::jsonb))
  LOOP
    v_raw_account_id := NULLIF(BTRIM(COALESCE(v_action_row->>'account_id', '')), '');
    v_raw_action := BTRIM(COALESCE(v_action_row->>'action', ''));
    v_raw_source_currency := UPPER(BTRIM(COALESCE(v_action_row->>'source_currency', '')));
    v_raw_target_currency := UPPER(BTRIM(COALESCE(v_action_row->>'target_currency', '')));
    v_raw_expected_source_balance := NULLIF(BTRIM(COALESCE(v_action_row->>'expected_source_balance', '')), '');
    v_raw_expected_converted_amount := NULLIF(BTRIM(COALESCE(v_action_row->>'expected_converted_amount', '')), '');
    v_raw_exchange_rate_snapshot_id := NULLIF(BTRIM(COALESCE(v_action_row->>'exchange_rate_snapshot_id', '')), '');
    v_raw_confirmation_checked := NULLIF(BTRIM(COALESCE(v_action_row->>'confirmation_checked', '')), '');

    v_account_id := v_raw_account_id::UUID;
    v_action := v_raw_action;
    v_source_currency := v_raw_source_currency;
    v_target_currency := v_raw_target_currency;
    v_expected_source_balance := v_raw_expected_source_balance::NUMERIC;
    v_expected_converted_amount := v_raw_expected_converted_amount::NUMERIC;
    v_exchange_rate_snapshot_id := CASE
      WHEN v_raw_exchange_rate_snapshot_id IS NULL THEN NULL
      ELSE v_raw_exchange_rate_snapshot_id::UUID
    END;
    v_confirmation_checked := COALESCE(v_raw_confirmation_checked::BOOLEAN, FALSE);

    SELECT *
    INTO v_account
    FROM public.financial_accounts
    WHERE id = v_account_id
      AND user_id = v_user_id
      AND COALESCE(is_active, FALSE) = TRUE
      AND COALESCE(ownership_type, 'personal') = 'personal'
      AND (scope_type IS NULL OR scope_type = 'personal')
      AND space_id IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION '%', v_accounts_changed_message;
    END IF;

    v_actual_balance := public.rpc_recalculate_financial_account_balance(v_account.id);

    IF v_action = 'keep' THEN
      v_kept_accounts_count := v_kept_accounts_count + 1;
      v_accounts := v_accounts || jsonb_build_array(
        jsonb_build_object(
          'accountId', v_account.id,
          'logicalAccountId', COALESCE(v_account.logical_account_id, v_account.id),
          'accountName', v_account.name,
          'action', 'keep',
          'previousCurrency', v_source_currency,
          'resultingCurrency', v_source_currency,
          'previousBalance', COALESCE(v_actual_balance, 0),
          'resultingBalance', COALESCE(v_actual_balance, 0),
          'archivedPreviousVersion', FALSE,
          'directUpdate', FALSE,
          'auditId', NULL,
          'newAccountId', NULL
        )
      );
      CONTINUE;
    END IF;

    v_result_row := NULL;

    IF v_action = 'correction' THEN
      SELECT *
      INTO v_result_row
      FROM public.rpc_change_financial_account_currency(
        p_actor_user_id => v_user_id,
        p_account_id => v_account.id,
        p_action_type => 'currency_correction',
        p_target_currency => v_target_currency,
        p_reason => 'reporting_currency_wizard',
        p_confirmation_checked => v_confirmation_checked,
        p_exchange_rate_snapshot_id => NULL,
        p_expected_source_balance => NULL,
        p_expected_converted_amount => NULL
      );

      IF NOT FOUND THEN
        RAISE EXCEPTION 'The account currency change did not return a result.';
      END IF;

      v_corrected_accounts_count := v_corrected_accounts_count + 1;
    ELSE
      SELECT *
      INTO v_result_row
      FROM public.rpc_change_financial_account_currency(
        p_actor_user_id => v_user_id,
        p_account_id => v_account.id,
        p_action_type => 'currency_conversion',
        p_target_currency => v_target_currency,
        p_reason => 'reporting_currency_wizard',
        p_confirmation_checked => FALSE,
        p_exchange_rate_snapshot_id => v_exchange_rate_snapshot_id,
        p_expected_source_balance => v_expected_source_balance,
        p_expected_converted_amount => v_expected_converted_amount
      );

      IF NOT FOUND THEN
        RAISE EXCEPTION 'The account currency change did not return a result.';
      END IF;

      v_converted_accounts_count := v_converted_accounts_count + 1;
      IF v_result_row.new_account_id IS NOT NULL THEN
        v_archived_accounts_count := v_archived_accounts_count + 1;
      END IF;
    END IF;

    v_result_json := jsonb_build_object(
      'accountId', COALESCE(v_result_row.old_account_id, v_account.id),
      'logicalAccountId', v_result_row.logical_account_id,
      'accountName', v_account.name,
      'action', CASE WHEN v_action = 'correction' THEN 'correction' ELSE 'conversion' END,
      'previousCurrency', v_result_row.previous_currency,
      'resultingCurrency', v_result_row.new_currency,
      'previousBalance', COALESCE(v_result_row.previous_balance, 0),
      'resultingBalance', COALESCE(v_result_row.resulting_balance, 0),
      'archivedPreviousVersion', COALESCE(v_result_row.new_account_id IS NOT NULL, FALSE),
      'directUpdate', COALESCE(v_result_row.direct_update, FALSE),
      'auditId', v_result_row.audit_id,
      'newAccountId', v_result_row.new_account_id
    );
    v_accounts := v_accounts || jsonb_build_array(v_result_json);
  END LOOP;

  UPDATE public.user_profiles
  SET default_currency = v_new_reporting_currency
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'previousReportingCurrency', v_previous_reporting_currency,
    'newReportingCurrency', v_new_reporting_currency,
    'convertedAccountsCount', v_converted_accounts_count,
    'keptAccountsCount', v_kept_accounts_count,
    'correctedAccountsCount', v_corrected_accounts_count,
    'archivedAccountsCount', v_archived_accounts_count,
    'changedAccounts', v_accounts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_change_reporting_currency_with_account_review(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_change_reporting_currency_with_account_review(UUID, TEXT, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_change_reporting_currency_with_account_review(UUID, TEXT, TEXT, JSONB) FROM authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.rpc_change_reporting_currency_with_account_review(UUID, TEXT, TEXT, JSONB) TO service_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
