-- ============================================================
-- Migration: 20260626230000_subscription_entitlements_and_ai_topups.sql
-- Purpose:
--   1. Add authoritative entitlement-aware helper functions and
--      restrictive RLS for AI History, Managed People, and Shared Spaces.
--   2. Add AI History retention cleanup foundation.
--   3. Add one-time AI top-up catalog, balances, orders, and immutable ledger.
--   4. Extend AI metering to consume included allowance first, then top-ups.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_required_table TEXT;
  v_required_function TEXT;
  v_required_type TEXT;
  v_required_column RECORD;
BEGIN
  FOREACH v_required_table IN ARRAY ARRAY[
    'public.platform_settings',
    'public.user_profiles',
    'public.subscription_plans',
    'public.user_subscriptions',
    'public.ai_usage_cycles',
    'public.ai_credit_ledger',
    'public.ai_requests',
    'public.ai_feedback',
    'public.ai_pending_actions',
    'public.managed_people',
    'public.person_aliases',
    'public.person_ledger_entries',
    'public.reimbursements',
    'public.reimbursement_payments',
    'public.settlements',
    'public.settlement_allocations',
    'public.spaces',
    'public.space_members',
    'public.space_invitations'
  ] LOOP
    IF to_regclass(v_required_table) IS NULL THEN
      RAISE EXCEPTION 'Required relation % does not exist.', v_required_table;
    END IF;
  END LOOP;

  FOREACH v_required_type IN ARRAY ARRAY[
    'public.subscription_plan_code',
    'public.credit_ledger_type'
  ] LOOP
    IF to_regtype(v_required_type) IS NULL THEN
      RAISE EXCEPTION 'Required type % does not exist.', v_required_type;
    END IF;
  END LOOP;

  FOREACH v_required_function IN ARRAY ARRAY[
    'public.is_admin_user()',
    'public.get_or_create_usage_cycle(uuid)',
    'public.ai_request_credit_cost(text)'
  ] LOOP
    IF to_regprocedure(v_required_function) IS NULL THEN
      RAISE EXCEPTION 'Required function % does not exist.', v_required_function;
    END IF;
  END LOOP;

  FOR v_required_column IN
    SELECT *
    FROM (
      VALUES
        ('public', 'subscription_plans', 'plan_code'),
        ('public', 'subscription_plans', 'is_active'),
        ('public', 'subscription_plans', 'text_ai_enabled'),
        ('public', 'subscription_plans', 'voice_ai_enabled'),
        ('public', 'subscription_plans', 'receipt_intelligence_enabled'),
        ('public', 'subscription_plans', 'ai_history_enabled'),
        ('public', 'subscription_plans', 'managed_people_enabled'),
        ('public', 'subscription_plans', 'shared_spaces_enabled'),
        ('public', 'subscription_plans', 'standard_reports_enabled'),
        ('public', 'subscription_plans', 'family_reports_enabled'),
        ('public', 'subscription_plans', 'ai_history_retention_days'),
        ('public', 'subscription_plans', 'monthly_ai_credits'),
        ('public', 'subscription_plans', 'daily_ai_request_limit'),
        ('public', 'subscription_plans', 'monthly_voice_seconds'),
        ('public', 'subscription_plans', 'monthly_receipt_extractions'),
        ('public', 'user_subscriptions', 'user_id'),
        ('public', 'user_subscriptions', 'plan_id'),
        ('public', 'user_subscriptions', 'status'),
        ('public', 'user_subscriptions', 'trial_ends_at'),
        ('public', 'ai_usage_cycles', 'user_id'),
        ('public', 'ai_usage_cycles', 'cycle_start'),
        ('public', 'ai_usage_cycles', 'cycle_end'),
        ('public', 'ai_usage_cycles', 'credits_allocated'),
        ('public', 'ai_usage_cycles', 'credits_consumed'),
        ('public', 'ai_usage_cycles', 'credits_reserved'),
        ('public', 'ai_usage_cycles', 'credits_refunded'),
        ('public', 'ai_usage_cycles', 'voice_seconds_used'),
        ('public', 'ai_usage_cycles', 'receipt_extractions_allocated'),
        ('public', 'ai_usage_cycles', 'receipt_extractions_consumed'),
        ('public', 'ai_usage_cycles', 'receipt_extractions_reserved'),
        ('public', 'ai_usage_cycles', 'receipt_extractions_refunded'),
        ('public', 'ai_usage_cycles', 'requests_today'),
        ('public', 'ai_usage_cycles', 'last_request_date'),
        ('public', 'ai_credit_ledger', 'user_id'),
        ('public', 'ai_credit_ledger', 'cycle_id'),
        ('public', 'ai_credit_ledger', 'ledger_type'),
        ('public', 'ai_credit_ledger', 'credits_delta'),
        ('public', 'ai_credit_ledger', 'credits_balance_after'),
        ('public', 'ai_credit_ledger', 'credit_cost'),
        ('public', 'ai_credit_ledger', 'idempotency_key'),
        ('public', 'ai_credit_ledger', 'request_type'),
        ('public', 'ai_credit_ledger', 'was_refunded'),
        ('public', 'ai_credit_ledger', 'notes')
    ) AS required_columns(table_schema, table_name, column_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = v_required_column.table_schema
        AND table_name = v_required_column.table_name
        AND column_name = v_required_column.column_name
    ) THEN
      RAISE EXCEPTION 'Required column %.%.% does not exist.',
        v_required_column.table_schema,
        v_required_column.table_name,
        v_required_column.column_name;
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ai_topup_resource_type'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.ai_topup_resource_type AS ENUM (
      'text_credit',
      'voice_second',
      'receipt_extraction',
      'bundle'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ai_topup_order_status'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.ai_topup_order_status AS ENUM (
      'draft',
      'pending_payment',
      'paid',
      'cancelled',
      'failed',
      'refunded',
      'payment_reversed'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ai_topup_ledger_entry_type'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.ai_topup_ledger_entry_type AS ENUM (
      'purchase',
      'consume',
      'refund',
      'admin_adjustment',
      'payment_reversal'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ai_topup_ledger_entry_status'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.ai_topup_ledger_entry_status AS ENUM (
      'reserved',
      'completed',
      'reversed'
    );
  END IF;
END $$;

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS vat_basis_points INTEGER NOT NULL DEFAULT 500;

ALTER TABLE public.ai_usage_cycles
  ADD COLUMN IF NOT EXISTS voice_seconds_reserved INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.ai_credit_ledger
  ADD COLUMN IF NOT EXISTS included_quantity_reserved INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS included_quantity_consumed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS included_quantity_refunded INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS included_credit_quantity_reserved INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS included_credit_quantity_consumed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS included_credit_quantity_refunded INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS topup_resource_type public.ai_topup_resource_type,
  ADD COLUMN IF NOT EXISTS topup_quantity_reserved INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS topup_quantity_consumed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS topup_quantity_refunded INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_topup_quantity_reserved INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_topup_quantity_consumed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_topup_quantity_refunded INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.ai_topup_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type public.ai_topup_resource_type NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT false,
  name TEXT NOT NULL,
  description TEXT,
  unit_quantity INTEGER NOT NULL CHECK (unit_quantity > 0),
  unit_label TEXT,
  price_amount INTEGER NOT NULL CHECK (price_amount >= 0),
  currency_code TEXT NOT NULL,
  minimum_quantity INTEGER NOT NULL DEFAULT 1 CHECK (minimum_quantity > 0),
  maximum_quantity INTEGER NOT NULL DEFAULT 1 CHECK (maximum_quantity > 0),
  quantity_step INTEGER NOT NULL DEFAULT 1 CHECK (quantity_step > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  bundle_components JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_topup_products_currency_code_check CHECK (char_length(trim(currency_code)) = 3),
  CONSTRAINT ai_topup_products_bundle_components_check CHECK (
    resource_type <> 'bundle'
    OR (bundle_components IS NOT NULL AND jsonb_typeof(bundle_components) = 'object')
  )
);

CREATE TABLE IF NOT EXISTS public.ai_topup_product_plan_eligibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.ai_topup_products(id) ON DELETE CASCADE,
  plan_code public.subscription_plan_code NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, plan_code)
);

CREATE TABLE IF NOT EXISTS public.ai_topup_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  order_reference TEXT NOT NULL UNIQUE,
  status public.ai_topup_order_status NOT NULL DEFAULT 'draft',
  provider TEXT,
  provider_checkout_session_id TEXT,
  provider_payment_id TEXT,
  provider_event_id TEXT,
  currency_code TEXT NOT NULL,
  vat_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (vat_basis_points >= 0),
  subtotal_amount INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  vat_amount INTEGER NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  total_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  invoice_reference TEXT,
  invoice_number TEXT,
  payment_reference TEXT,
  paid_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_topup_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.ai_topup_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.ai_topup_products(id),
  product_name TEXT NOT NULL,
  resource_type public.ai_topup_resource_type NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_quantity INTEGER NOT NULL CHECK (unit_quantity > 0),
  granted_quantity INTEGER NOT NULL CHECK (granted_quantity >= 0),
  unit_price_amount INTEGER NOT NULL CHECK (unit_price_amount >= 0),
  subtotal_amount INTEGER NOT NULL CHECK (subtotal_amount >= 0),
  currency_code TEXT NOT NULL,
  bundle_components JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_topup_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  resource_type public.ai_topup_resource_type NOT NULL,
  available_quantity INTEGER NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  total_purchased_quantity INTEGER NOT NULL DEFAULT 0 CHECK (total_purchased_quantity >= 0),
  total_consumed_quantity INTEGER NOT NULL DEFAULT 0 CHECK (total_consumed_quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, resource_type),
  CONSTRAINT ai_topup_balances_resource_type_check CHECK (resource_type <> 'bundle')
);

CREATE TABLE IF NOT EXISTS public.ai_topup_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.ai_topup_orders(id) ON DELETE SET NULL,
  order_item_id UUID REFERENCES public.ai_topup_order_items(id) ON DELETE SET NULL,
  balance_id UUID REFERENCES public.ai_topup_balances(id) ON DELETE SET NULL,
  related_ai_credit_ledger_id UUID REFERENCES public.ai_credit_ledger(id) ON DELETE SET NULL,
  admin_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  resource_type public.ai_topup_resource_type NOT NULL,
  entry_type public.ai_topup_ledger_entry_type NOT NULL,
  entry_status public.ai_topup_ledger_entry_status NOT NULL DEFAULT 'completed',
  quantity_delta_available INTEGER NOT NULL DEFAULT 0,
  quantity_delta_reserved INTEGER NOT NULL DEFAULT 0,
  purchased_quantity_delta INTEGER NOT NULL DEFAULT 0,
  consumed_quantity_delta INTEGER NOT NULL DEFAULT 0,
  available_quantity_after INTEGER NOT NULL CHECK (available_quantity_after >= 0),
  reserved_quantity_after INTEGER NOT NULL CHECK (reserved_quantity_after >= 0),
  total_purchased_quantity_after INTEGER NOT NULL CHECK (total_purchased_quantity_after >= 0),
  total_consumed_quantity_after INTEGER NOT NULL CHECK (total_consumed_quantity_after >= 0),
  reason TEXT,
  payment_reference TEXT,
  provider_event_id TEXT,
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_topup_ledger_resource_type_check CHECK (resource_type <> 'bundle')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_topup_ledger_idempotency
  ON public.ai_topup_ledger (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_topup_products_sort
  ON public.ai_topup_products (active, enabled, sort_order, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_topup_orders_user_created
  ON public.ai_topup_orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_topup_orders_status_created
  ON public.ai_topup_orders (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_topup_orders_provider_checkout_session
  ON public.ai_topup_orders (provider, provider_checkout_session_id)
  WHERE provider_checkout_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_topup_orders_provider_event
  ON public.ai_topup_orders (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_topup_balances_user_resource
  ON public.ai_topup_balances (user_id, resource_type);

CREATE INDEX IF NOT EXISTS idx_ai_topup_ledger_user_created
  ON public.ai_topup_ledger (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_topup_products_seed_code
  ON public.ai_topup_products ((metadata ->> 'seed_code'))
  WHERE metadata ? 'seed_code';

CREATE OR REPLACE FUNCTION public.is_subscription_operational(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_sub RECORD;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT
    us.status,
    us.trial_ends_at,
    sp.is_active AS plan_active
  INTO v_sub
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF NOT COALESCE(v_sub.plan_active, false) THEN
    RETURN FALSE;
  END IF;

  IF v_sub.status NOT IN ('trialing', 'active') THEN
    RETURN FALSE;
  END IF;

  IF v_sub.status = 'trialing' AND v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at < now() THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.subscription_feature_enabled_for_user(
  p_user_id UUID,
  p_feature TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_sub RECORD;
  v_enabled BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT
    us.status,
    us.trial_ends_at,
    sp.is_active AS plan_active,
    sp.text_ai_enabled,
    sp.voice_ai_enabled,
    sp.receipt_intelligence_enabled,
    sp.ai_history_enabled,
    sp.managed_people_enabled,
    sp.shared_spaces_enabled,
    sp.standard_reports_enabled,
    sp.family_reports_enabled
  INTO v_sub
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF NOT COALESCE(v_sub.plan_active, false) THEN
    RETURN FALSE;
  END IF;

  IF v_sub.status NOT IN ('trialing', 'active') THEN
    RETURN FALSE;
  END IF;

  IF v_sub.status = 'trialing' AND v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at < now() THEN
    RETURN FALSE;
  END IF;

  v_enabled := CASE p_feature
    WHEN 'text_ai' THEN COALESCE(v_sub.text_ai_enabled, false)
    WHEN 'voice_ai' THEN COALESCE(v_sub.voice_ai_enabled, false)
    WHEN 'receipt_intelligence' THEN COALESCE(v_sub.receipt_intelligence_enabled, false)
    WHEN 'ai_history' THEN COALESCE(v_sub.ai_history_enabled, false)
    WHEN 'managed_people' THEN COALESCE(v_sub.managed_people_enabled, false)
    WHEN 'shared_spaces' THEN COALESCE(v_sub.shared_spaces_enabled, false)
    WHEN 'standard_reports' THEN COALESCE(v_sub.standard_reports_enabled, false)
    WHEN 'family_reports' THEN COALESCE(v_sub.family_reports_enabled, false)
    ELSE FALSE
  END;

  RETURN COALESCE(v_enabled, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.subscription_feature_enabled_for_current_user(p_feature TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.subscription_feature_enabled_for_user(auth.uid(), p_feature);
$$;

CREATE OR REPLACE FUNCTION public.subscription_ai_history_retention_days_for_user(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_days INTEGER := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT COALESCE(sp.ai_history_retention_days, 0)
  INTO v_days
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id
    AND public.subscription_feature_enabled_for_user(p_user_id, 'ai_history')
  LIMIT 1;

  RETURN GREATEST(COALESCE(v_days, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_ai_topup_balance_row(
  p_user_id UUID,
  p_resource_type public.ai_topup_resource_type
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_balance_id UUID;
BEGIN
  IF p_resource_type = 'bundle' THEN
    RAISE EXCEPTION 'Bundle is not a balance resource.';
  END IF;

  INSERT INTO public.ai_topup_balances (user_id, resource_type)
  VALUES (p_user_id, p_resource_type)
  ON CONFLICT (user_id, resource_type) DO NOTHING
  RETURNING id INTO v_balance_id;

  IF v_balance_id IS NULL THEN
    SELECT id
    INTO v_balance_id
    FROM public.ai_topup_balances
    WHERE user_id = p_user_id
      AND resource_type = p_resource_type
    LIMIT 1;
  END IF;

  RETURN v_balance_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_ai_topup_balance(
  p_user_id UUID,
  p_resource_type public.ai_topup_resource_type,
  p_quantity_delta_available INTEGER,
  p_quantity_delta_reserved INTEGER,
  p_purchased_quantity_delta INTEGER,
  p_consumed_quantity_delta INTEGER,
  p_entry_type public.ai_topup_ledger_entry_type,
  p_entry_status public.ai_topup_ledger_entry_status DEFAULT 'completed',
  p_order_id UUID DEFAULT NULL,
  p_order_item_id UUID DEFAULT NULL,
  p_related_ai_credit_ledger_id UUID DEFAULT NULL,
  p_admin_user_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_payment_reference TEXT DEFAULT NULL,
  p_provider_event_id TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_balance_id UUID;
  v_balance RECORD;
  v_ledger_id UUID;
  v_next_available INTEGER;
  v_next_reserved INTEGER;
  v_next_purchased INTEGER;
  v_next_consumed INTEGER;
BEGIN
  IF p_resource_type = 'bundle' THEN
    RAISE EXCEPTION 'Bundle is not a balance resource.';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id
    INTO v_ledger_id
    FROM public.ai_topup_ledger
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF v_ledger_id IS NOT NULL THEN
      RETURN v_ledger_id;
    END IF;
  END IF;

  v_balance_id := public.ensure_ai_topup_balance_row(p_user_id, p_resource_type);

  SELECT *
  INTO v_balance
  FROM public.ai_topup_balances
  WHERE id = v_balance_id
  FOR UPDATE;

  v_next_available := COALESCE(v_balance.available_quantity, 0) + COALESCE(p_quantity_delta_available, 0);
  v_next_reserved := COALESCE(v_balance.reserved_quantity, 0) + COALESCE(p_quantity_delta_reserved, 0);
  v_next_purchased := COALESCE(v_balance.total_purchased_quantity, 0) + COALESCE(p_purchased_quantity_delta, 0);
  v_next_consumed := COALESCE(v_balance.total_consumed_quantity, 0) + COALESCE(p_consumed_quantity_delta, 0);

  IF v_next_available < 0 OR v_next_reserved < 0 OR v_next_purchased < 0 OR v_next_consumed < 0 THEN
    RAISE EXCEPTION 'AI top-up balance would become negative.';
  END IF;

  UPDATE public.ai_topup_balances
  SET
    available_quantity = v_next_available,
    reserved_quantity = v_next_reserved,
    total_purchased_quantity = v_next_purchased,
    total_consumed_quantity = v_next_consumed,
    updated_at = now()
  WHERE id = v_balance_id;

  INSERT INTO public.ai_topup_ledger (
    user_id,
    order_id,
    order_item_id,
    balance_id,
    related_ai_credit_ledger_id,
    admin_user_id,
    resource_type,
    entry_type,
    entry_status,
    quantity_delta_available,
    quantity_delta_reserved,
    purchased_quantity_delta,
    consumed_quantity_delta,
    available_quantity_after,
    reserved_quantity_after,
    total_purchased_quantity_after,
    total_consumed_quantity_after,
    reason,
    payment_reference,
    provider_event_id,
    idempotency_key,
    metadata
  )
  VALUES (
    p_user_id,
    p_order_id,
    p_order_item_id,
    v_balance_id,
    p_related_ai_credit_ledger_id,
    p_admin_user_id,
    p_resource_type,
    p_entry_type,
    p_entry_status,
    COALESCE(p_quantity_delta_available, 0),
    COALESCE(p_quantity_delta_reserved, 0),
    COALESCE(p_purchased_quantity_delta, 0),
    COALESCE(p_consumed_quantity_delta, 0),
    v_next_available,
    v_next_reserved,
    v_next_purchased,
    v_next_consumed,
    p_reason,
    p_payment_reference,
    p_provider_event_id,
    p_idempotency_key,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_ledger_id;

  RETURN v_ledger_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_topup_available_quantity(
  p_user_id UUID,
  p_resource_type public.ai_topup_resource_type
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN COALESCE((
    SELECT available_quantity
    FROM public.ai_topup_balances
    WHERE user_id = p_user_id
      AND resource_type = p_resource_type
    LIMIT 1
  ), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_purchase_ai_topups_for_user(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN public.is_subscription_operational(p_user_id)
     AND EXISTS (
       SELECT 1
       FROM public.user_subscriptions us
       JOIN public.subscription_plans sp ON sp.id = us.plan_id
       WHERE us.user_id = p_user_id
         AND sp.plan_code IN ('personal', 'family')
     );
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_topup_reversal_available_quantity(
  p_user_id UUID,
  p_resource_type public.ai_topup_resource_type,
  p_requested_quantity INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_balance_id UUID;
  v_available_quantity INTEGER := 0;
BEGIN
  IF p_resource_type = 'bundle' THEN
    RAISE EXCEPTION 'Bundle is not a balance resource.';
  END IF;

  IF GREATEST(COALESCE(p_requested_quantity, 0), 0) = 0 THEN
    RETURN 0;
  END IF;

  v_balance_id := public.ensure_ai_topup_balance_row(p_user_id, p_resource_type);

  SELECT available_quantity
  INTO v_available_quantity
  FROM public.ai_topup_balances
  WHERE id = v_balance_id
  FOR UPDATE;

  RETURN LEAST(
    GREATEST(COALESCE(v_available_quantity, 0), 0),
    GREATEST(COALESCE(p_requested_quantity, 0), 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fulfill_ai_topup_order_payment(
  p_order_id UUID,
  p_provider TEXT,
  p_provider_event_id TEXT,
  p_payment_reference TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_bundle_key TEXT;
  v_bundle_value JSONB;
  v_bundle_quantity INTEGER;
BEGIN
  SELECT *
  INTO v_order
  FROM public.ai_topup_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI top-up order not found.';
  END IF;

  IF v_order.status = 'paid' THEN
    RETURN TRUE;
  END IF;

  IF v_order.status NOT IN ('draft', 'pending_payment') THEN
    RAISE EXCEPTION 'Order is not payable in its current state.';
  END IF;

  FOR v_item IN
    SELECT *
    FROM public.ai_topup_order_items
    WHERE order_id = p_order_id
    ORDER BY created_at ASC, id ASC
  LOOP
    IF v_item.resource_type = 'bundle' THEN
      FOR v_bundle_key, v_bundle_value IN
        SELECT key, value
        FROM jsonb_each(COALESCE(v_item.bundle_components, '{}'::jsonb))
      LOOP
        IF v_bundle_key IS NULL OR v_bundle_key = 'bundle' THEN
          RAISE EXCEPTION 'Invalid bundle component key for order item %.', v_item.id;
        END IF;

        IF jsonb_typeof(v_bundle_value) <> 'number' THEN
          RAISE EXCEPTION 'Invalid bundle component quantity for order item %.', v_item.id;
        END IF;

        v_bundle_quantity := (v_bundle_value #>> '{}')::INTEGER;
        IF v_bundle_quantity <= 0 THEN
          RAISE EXCEPTION 'Bundle component quantity must be positive for order item %.', v_item.id;
        END IF;

        PERFORM public.adjust_ai_topup_balance(
          v_order.user_id,
          v_bundle_key::public.ai_topup_resource_type,
          (v_bundle_quantity * v_item.quantity),
          0,
          (v_bundle_quantity * v_item.quantity),
          0,
          'purchase',
          'completed',
          v_order.id,
          v_item.id,
          NULL,
          NULL,
          'order_fulfilled',
          p_payment_reference,
          p_provider_event_id,
          CONCAT('topup-purchase:', v_order.id::TEXT, ':', v_item.id::TEXT, ':', v_bundle_key),
          jsonb_build_object('provider', p_provider, 'product_resource_type', v_item.resource_type)
        );
      END LOOP;
    ELSE
      PERFORM public.adjust_ai_topup_balance(
        v_order.user_id,
        v_item.resource_type,
        v_item.granted_quantity,
        0,
        v_item.granted_quantity,
        0,
        'purchase',
        'completed',
        v_order.id,
        v_item.id,
        NULL,
        NULL,
        'order_fulfilled',
        p_payment_reference,
        p_provider_event_id,
        CONCAT('topup-purchase:', v_order.id::TEXT, ':', v_item.id::TEXT),
        jsonb_build_object('provider', p_provider)
      );
    END IF;
  END LOOP;

  UPDATE public.ai_topup_orders
  SET
    status = 'paid',
    provider = COALESCE(p_provider, provider),
    provider_event_id = COALESCE(p_provider_event_id, provider_event_id),
    payment_reference = COALESCE(p_payment_reference, payment_reference),
    paid_at = COALESCE(paid_at, now()),
    fulfilled_at = COALESCE(fulfilled_at, now()),
    invoice_reference = COALESCE(invoice_reference, CONCAT('AI-TOPUP-', upper(replace(id::TEXT, '-', '')))),
    invoice_number = COALESCE(invoice_number, CONCAT('SP-TU-', to_char(now(), 'YYYYMMDD'), '-', substring(upper(replace(id::TEXT, '-', '')) from 1 for 8))),
    updated_at = now()
  WHERE id = p_order_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_ai_topup_order_payment(
  p_order_id UUID,
  p_provider_event_id TEXT,
  p_payment_reference TEXT,
  p_reason TEXT DEFAULT 'payment_reversal'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_bundle_key TEXT;
  v_bundle_value JSONB;
  v_bundle_quantity INTEGER;
  v_reversal_quantity INTEGER;
  v_unreversed_quantity INTEGER;
  v_unreversed_summary JSONB := '{}'::jsonb;
BEGIN
  SELECT *
  INTO v_order
  FROM public.ai_topup_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI top-up order not found.';
  END IF;

  IF v_order.status = 'payment_reversed' THEN
    RETURN TRUE;
  END IF;

  IF v_order.status <> 'paid' THEN
    RAISE EXCEPTION 'Only paid orders can be reversed.';
  END IF;

  FOR v_item IN
    SELECT *
    FROM public.ai_topup_order_items
    WHERE order_id = p_order_id
    ORDER BY created_at ASC, id ASC
  LOOP
    IF v_item.resource_type = 'bundle' THEN
      FOR v_bundle_key, v_bundle_value IN
        SELECT key, value
        FROM jsonb_each(COALESCE(v_item.bundle_components, '{}'::jsonb))
      LOOP
        IF v_bundle_key IS NULL OR v_bundle_key = 'bundle' THEN
          RAISE EXCEPTION 'Invalid bundle component key for reversal item %.', v_item.id;
        END IF;

        IF jsonb_typeof(v_bundle_value) <> 'number' THEN
          RAISE EXCEPTION 'Invalid bundle component quantity for reversal item %.', v_item.id;
        END IF;

        v_bundle_quantity := (v_bundle_value #>> '{}')::INTEGER * v_item.quantity;
        IF v_bundle_quantity <= 0 THEN
          RAISE EXCEPTION 'Bundle reversal quantity must be positive for order item %.', v_item.id;
        END IF;

        v_reversal_quantity := public.ai_topup_reversal_available_quantity(
          v_order.user_id,
          v_bundle_key::public.ai_topup_resource_type,
          v_bundle_quantity
        );
        v_unreversed_quantity := GREATEST(v_bundle_quantity - v_reversal_quantity, 0);

        IF v_reversal_quantity > 0 THEN
          PERFORM public.adjust_ai_topup_balance(
            v_order.user_id,
            v_bundle_key::public.ai_topup_resource_type,
            -v_reversal_quantity,
            0,
            -v_reversal_quantity,
            0,
            'payment_reversal',
            'completed',
            v_order.id,
            v_item.id,
            NULL,
            NULL,
            p_reason,
            p_payment_reference,
            p_provider_event_id,
            CONCAT('topup-reversal:', v_order.id::TEXT, ':', v_item.id::TEXT, ':', v_bundle_key),
            jsonb_build_object(
              'provider_event_id', p_provider_event_id,
              'requested_quantity', v_bundle_quantity,
              'reversed_quantity', v_reversal_quantity,
              'unreversed_quantity', v_unreversed_quantity
            )
          );
        END IF;

        IF v_unreversed_quantity > 0 THEN
          v_unreversed_summary := jsonb_set(
            v_unreversed_summary,
            ARRAY[v_bundle_key],
            to_jsonb(COALESCE((v_unreversed_summary ->> v_bundle_key)::INTEGER, 0) + v_unreversed_quantity),
            true
          );
        END IF;
      END LOOP;
    ELSE
      v_reversal_quantity := public.ai_topup_reversal_available_quantity(
        v_order.user_id,
        v_item.resource_type,
        v_item.granted_quantity
      );
      v_unreversed_quantity := GREATEST(v_item.granted_quantity - v_reversal_quantity, 0);

      IF v_reversal_quantity > 0 THEN
        PERFORM public.adjust_ai_topup_balance(
          v_order.user_id,
          v_item.resource_type,
          -v_reversal_quantity,
          0,
          -v_reversal_quantity,
          0,
          'payment_reversal',
          'completed',
          v_order.id,
          v_item.id,
          NULL,
          NULL,
          p_reason,
          p_payment_reference,
          p_provider_event_id,
          CONCAT('topup-reversal:', v_order.id::TEXT, ':', v_item.id::TEXT),
          jsonb_build_object(
            'provider_event_id', p_provider_event_id,
            'requested_quantity', v_item.granted_quantity,
            'reversed_quantity', v_reversal_quantity,
            'unreversed_quantity', v_unreversed_quantity
          )
        );
      END IF;

      IF v_unreversed_quantity > 0 THEN
        v_unreversed_summary := jsonb_set(
          v_unreversed_summary,
          ARRAY[v_item.resource_type::TEXT],
          to_jsonb(COALESCE((v_unreversed_summary ->> v_item.resource_type::TEXT)::INTEGER, 0) + v_unreversed_quantity),
          true
        );
      END IF;
    END IF;
  END LOOP;

  UPDATE public.ai_topup_orders
  SET
    status = 'payment_reversed',
    provider_event_id = COALESCE(p_provider_event_id, provider_event_id),
    payment_reference = COALESCE(p_payment_reference, payment_reference),
    failure_reason = CASE
      WHEN v_unreversed_summary <> '{}'::jsonb
        THEN CONCAT(COALESCE(NULLIF(trim(p_reason), ''), 'payment_reversal'), ' | partial_unreversed_balance')
      ELSE COALESCE(NULLIF(trim(p_reason), ''), failure_reason)
    END,
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{payment_reversal}',
      jsonb_build_object(
        'provider_event_id', p_provider_event_id,
        'payment_reference', p_payment_reference,
        'reason', COALESCE(NULLIF(trim(p_reason), ''), 'payment_reversal'),
        'partial', v_unreversed_summary <> '{}'::jsonb,
        'unreversed_quantities', v_unreversed_summary,
        'recorded_at', now()
      ),
      true
    ),
    updated_at = now()
  WHERE id = p_order_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_ai_topup_balance(
  p_admin_user_id UUID,
  p_user_id UUID,
  p_resource_type public.ai_topup_resource_type,
  p_quantity_delta INTEGER,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_admin_user_id UUID := auth.uid();
BEGIN
  IF v_actor_admin_user_id IS NOT NULL AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  IF v_actor_admin_user_id IS NOT NULL
     AND p_admin_user_id IS NOT NULL
     AND p_admin_user_id <> v_actor_admin_user_id THEN
    RAISE EXCEPTION 'Permission denied: admin actor mismatch';
  END IF;

  IF COALESCE(NULLIF(trim(p_reason), ''), '') = '' THEN
    RAISE EXCEPTION 'Adjustment reason is required.';
  END IF;

  RETURN public.adjust_ai_topup_balance(
    p_user_id,
    p_resource_type,
    p_quantity_delta,
    0,
    GREATEST(p_quantity_delta, 0),
    0,
    'admin_adjustment',
    'completed',
    NULL,
    NULL,
    NULL,
    COALESCE(v_actor_admin_user_id, p_admin_user_id),
    p_reason,
    NULL,
    NULL,
    NULL,
    jsonb_build_object('adjustment_delta', p_quantity_delta)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_ai_history_retention(
  p_target_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 500
)
RETURNS TABLE (
  user_id UUID,
  request_id UUID,
  deleted_feedback_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_row RECORD;
  v_feedback_count INTEGER;
BEGIN
  FOR v_row IN
    SELECT
      ar.user_id,
      ar.id AS request_id
    FROM public.ai_requests ar
    JOIN public.user_subscriptions us ON us.user_id = ar.user_id
    JOIN public.subscription_plans sp ON sp.id = us.plan_id
    WHERE public.subscription_feature_enabled_for_user(ar.user_id, 'ai_history')
      AND COALESCE(sp.ai_history_retention_days, 0) > 0
      AND ar.created_at < (now() - (sp.ai_history_retention_days || ' days')::INTERVAL)
      AND (p_target_user_id IS NULL OR ar.user_id = p_target_user_id)
    ORDER BY ar.created_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 500), 1)
  LOOP
    DELETE FROM public.ai_feedback
    WHERE request_id = v_row.request_id;
    GET DIAGNOSTICS v_feedback_count = ROW_COUNT;

    DELETE FROM public.ai_pending_actions
    WHERE request_id = v_row.request_id;

    DELETE FROM public.ai_requests
    WHERE id = v_row.request_id;

    user_id := v_row.user_id;
    request_id := v_row.request_id;
    deleted_feedback_count := COALESCE(v_feedback_count, 0);
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_ai_access(
  p_user_id UUID,
  p_request_type TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_sub RECORD;
  v_cycle RECORD;
  v_cycle_id UUID;
  v_today DATE := CURRENT_DATE;
  v_credit_cost INTEGER;
  v_text_topup_remaining INTEGER := 0;
  v_voice_topup_remaining INTEGER := 0;
  v_receipt_topup_remaining INTEGER := 0;
  v_included_text_remaining INTEGER := 0;
  v_included_voice_remaining INTEGER := 0;
  v_included_receipt_remaining INTEGER := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT
    us.*,
    sp.plan_code,
    sp.monthly_ai_credits,
    sp.daily_ai_request_limit,
    sp.monthly_voice_seconds,
    sp.monthly_receipt_extractions,
    sp.receipt_intelligence_enabled,
    sp.text_ai_enabled,
    sp.voice_ai_enabled,
    sp.is_active AS plan_active
  INTO v_sub
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 'no_subscription';
  END IF;

  IF NOT v_sub.plan_active THEN
    RETURN 'plan_inactive';
  END IF;

  IF v_sub.status NOT IN ('trialing', 'active') THEN
    RETURN 'subscription_expired';
  END IF;

  IF v_sub.status = 'trialing' AND v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at < now() THEN
    RETURN 'trial_expired';
  END IF;

  IF p_request_type = 'text' AND NOT COALESCE(v_sub.text_ai_enabled, false) THEN
    RETURN 'text_ai_disabled';
  END IF;

  IF p_request_type = 'voice' AND NOT COALESCE(v_sub.voice_ai_enabled, false) THEN
    RETURN 'voice_ai_disabled';
  END IF;

  IF p_request_type = 'receipt_extraction' AND NOT COALESCE(v_sub.receipt_intelligence_enabled, false) THEN
    RETURN 'receipt_ai_disabled';
  END IF;

  v_cycle_id := public.get_or_create_usage_cycle(p_user_id);

  SELECT *
  INTO v_cycle
  FROM public.ai_usage_cycles
  WHERE id = v_cycle_id;

  IF p_request_type <> 'receipt_extraction' AND COALESCE(v_cycle.last_request_date, CURRENT_DATE) = v_today THEN
    IF COALESCE(v_cycle.requests_today, 0) >= COALESCE(v_sub.daily_ai_request_limit, 0) THEN
      RETURN 'daily_limit_reached';
    END IF;
  END IF;

  v_text_topup_remaining := public.ai_topup_available_quantity(p_user_id, 'text_credit');
  v_voice_topup_remaining := public.ai_topup_available_quantity(p_user_id, 'voice_second');
  v_receipt_topup_remaining := public.ai_topup_available_quantity(p_user_id, 'receipt_extraction');

  v_included_text_remaining := GREATEST(
    COALESCE(v_cycle.credits_allocated, 0)
    - COALESCE(v_cycle.credits_consumed, 0)
    - COALESCE(v_cycle.credits_reserved, 0),
    0
  );

  v_included_voice_remaining := GREATEST(
    COALESCE(v_sub.monthly_voice_seconds, 0)
    - COALESCE(v_cycle.voice_seconds_used, 0)
    - COALESCE(v_cycle.voice_seconds_reserved, 0),
    0
  );

  v_included_receipt_remaining := GREATEST(
    COALESCE(v_cycle.receipt_extractions_allocated, 0)
    - COALESCE(v_cycle.receipt_extractions_consumed, 0)
    - COALESCE(v_cycle.receipt_extractions_reserved, 0),
    0
  );

  IF p_request_type = 'receipt_extraction' THEN
    IF (v_included_receipt_remaining + v_receipt_topup_remaining) <= 0 THEN
      RETURN 'receipt_limit_reached';
    END IF;

    RETURN NULL;
  END IF;

  IF p_request_type = 'voice' THEN
    IF (v_included_voice_remaining + v_voice_topup_remaining) <= 0 THEN
      RETURN 'voice_limit_reached';
    END IF;
  END IF;

  v_credit_cost := public.ai_request_credit_cost(p_request_type);

  IF p_request_type = 'voice' AND (v_included_text_remaining + v_text_topup_remaining) < v_credit_cost THEN
    RETURN 'credits_exhausted';
  END IF;

  IF p_request_type = 'text' AND (v_included_text_remaining + v_text_topup_remaining) < v_credit_cost THEN
    RETURN 'credits_exhausted';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_ai_credits(
  p_user_id UUID,
  p_request_type TEXT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_expected_voice_seconds INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_cycle_id UUID;
  v_credit_cost INTEGER;
  v_ledger_id UUID;
  v_balance INTEGER;
  v_access_err TEXT;
  v_existing RECORD;
  v_cycle RECORD;
  v_sub RECORD;
  v_text_included_remaining INTEGER;
  v_voice_included_remaining INTEGER;
  v_receipt_included_remaining INTEGER;
  v_text_topup_to_reserve INTEGER := 0;
  v_voice_topup_to_reserve INTEGER := 0;
  v_receipt_topup_to_reserve INTEGER := 0;
  v_included_to_reserve INTEGER := 0;
  v_included_credit_to_reserve INTEGER := 0;
  v_credit_topup_to_reserve INTEGER := 0;
  v_voice_seconds_to_reserve INTEGER := GREATEST(COALESCE(p_expected_voice_seconds, 1), 1);
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT
      id,
      cycle_id,
      COALESCE(credit_cost, ABS(credits_delta), public.ai_request_credit_cost(COALESCE(request_type, p_request_type))) AS credit_cost,
      COALESCE(request_type, p_request_type) AS request_type,
      included_quantity_reserved,
      topup_quantity_reserved,
      topup_resource_type
    INTO v_existing
    FROM public.ai_credit_ledger
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'cycle_id', v_existing.cycle_id,
        'ledger_id', v_existing.id,
        'credits_reserved', v_existing.credit_cost,
        'duplicate', true,
        'request_type', v_existing.request_type
      );
    END IF;
  END IF;

  v_access_err := public.check_ai_access(p_user_id, p_request_type);
  IF v_access_err IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_access_err);
  END IF;

  v_credit_cost := public.ai_request_credit_cost(p_request_type);
  v_cycle_id := public.get_or_create_usage_cycle(p_user_id);

  SELECT *
  INTO v_cycle
  FROM public.ai_usage_cycles
  WHERE id = v_cycle_id
  FOR UPDATE;

  SELECT
    sp.monthly_voice_seconds
  INTO v_sub
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id
  LIMIT 1;

  v_text_included_remaining := GREATEST(
    COALESCE(v_cycle.credits_allocated, 0)
    - COALESCE(v_cycle.credits_consumed, 0)
    - COALESCE(v_cycle.credits_reserved, 0),
    0
  );

  v_voice_included_remaining := GREATEST(
    COALESCE(v_sub.monthly_voice_seconds, 0)
    - COALESCE(v_cycle.voice_seconds_used, 0)
    - COALESCE(v_cycle.voice_seconds_reserved, 0),
    0
  );

  v_receipt_included_remaining := GREATEST(
    COALESCE(v_cycle.receipt_extractions_allocated, 0)
    - COALESCE(v_cycle.receipt_extractions_consumed, 0)
    - COALESCE(v_cycle.receipt_extractions_reserved, 0),
    0
  );

  IF p_request_type = 'receipt_extraction' THEN
    v_included_to_reserve := LEAST(v_receipt_included_remaining, 1);
    v_receipt_topup_to_reserve := 1 - v_included_to_reserve;

    UPDATE public.ai_usage_cycles
    SET
      receipt_extractions_reserved = receipt_extractions_reserved + v_included_to_reserve,
      updated_at = now()
    WHERE id = v_cycle_id;

    IF v_receipt_topup_to_reserve > 0 THEN
      PERFORM public.adjust_ai_topup_balance(
        p_user_id,
        'receipt_extraction',
        -v_receipt_topup_to_reserve,
        v_receipt_topup_to_reserve,
        0,
        0,
        'consume',
        'reserved',
        NULL,
        NULL,
        NULL,
        NULL,
        'ai_reservation',
        NULL,
        NULL,
        CONCAT('topup-reserve:', p_idempotency_key),
        jsonb_build_object('request_type', p_request_type)
      );
    END IF;
  ELSIF p_request_type = 'voice' THEN
    v_included_to_reserve := LEAST(v_voice_included_remaining, v_voice_seconds_to_reserve);
    v_voice_topup_to_reserve := v_voice_seconds_to_reserve - v_included_to_reserve;
    v_included_credit_to_reserve := LEAST(v_text_included_remaining, v_credit_cost);
    v_credit_topup_to_reserve := v_credit_cost - v_included_credit_to_reserve;

    UPDATE public.ai_usage_cycles
    SET
      voice_seconds_reserved = voice_seconds_reserved + v_included_to_reserve,
      credits_reserved = credits_reserved + v_included_credit_to_reserve,
      requests_today = CASE WHEN last_request_date = CURRENT_DATE THEN requests_today + 1 ELSE 1 END,
      last_request_date = CURRENT_DATE,
      updated_at = now()
    WHERE id = v_cycle_id;

    IF v_voice_topup_to_reserve > 0 THEN
      PERFORM public.adjust_ai_topup_balance(
        p_user_id,
        'voice_second',
        -v_voice_topup_to_reserve,
        v_voice_topup_to_reserve,
        0,
        0,
        'consume',
        'reserved',
        NULL,
        NULL,
        NULL,
        NULL,
        'ai_reservation',
        NULL,
        NULL,
        CONCAT('topup-reserve:', p_idempotency_key),
        jsonb_build_object('request_type', p_request_type)
      );
    END IF;

    IF v_credit_topup_to_reserve > 0 THEN
      PERFORM public.adjust_ai_topup_balance(
        p_user_id,
        'text_credit',
        -v_credit_topup_to_reserve,
        v_credit_topup_to_reserve,
        0,
        0,
        'consume',
        'reserved',
        NULL,
        NULL,
        NULL,
        NULL,
        'ai_credit_reservation',
        NULL,
        NULL,
        CONCAT('topup-credit-reserve:', p_idempotency_key),
        jsonb_build_object('request_type', p_request_type, 'resource_type', 'text_credit')
      );
    END IF;
  ELSE
    v_included_to_reserve := LEAST(v_text_included_remaining, v_credit_cost);
    v_text_topup_to_reserve := v_credit_cost - v_included_to_reserve;

    UPDATE public.ai_usage_cycles
    SET
      credits_reserved = credits_reserved + v_included_to_reserve,
      requests_today = CASE WHEN last_request_date = CURRENT_DATE THEN requests_today + 1 ELSE 1 END,
      last_request_date = CURRENT_DATE,
      updated_at = now()
    WHERE id = v_cycle_id;

    IF v_text_topup_to_reserve > 0 THEN
      PERFORM public.adjust_ai_topup_balance(
        p_user_id,
        'text_credit',
        -v_text_topup_to_reserve,
        v_text_topup_to_reserve,
        0,
        0,
        'consume',
        'reserved',
        NULL,
        NULL,
        NULL,
        NULL,
        'ai_reservation',
        NULL,
        NULL,
        CONCAT('topup-reserve:', p_idempotency_key),
        jsonb_build_object('request_type', p_request_type)
      );
    END IF;
  END IF;

  SELECT
    COALESCE(credits_allocated, 0) - COALESCE(credits_consumed, 0) - COALESCE(credits_reserved, 0)
  INTO v_balance
  FROM public.ai_usage_cycles
  WHERE id = v_cycle_id;

  INSERT INTO public.ai_credit_ledger (
    user_id,
    cycle_id,
    ledger_type,
    credits_delta,
    credits_balance_after,
    credit_cost,
    idempotency_key,
    request_type,
    included_quantity_reserved,
    included_credit_quantity_reserved,
    topup_resource_type,
    topup_quantity_reserved,
    credit_topup_quantity_reserved,
    notes
  )
  VALUES (
    p_user_id,
    v_cycle_id,
    'reservation',
    -v_credit_cost,
    v_balance,
    v_credit_cost,
    p_idempotency_key,
    p_request_type,
    v_included_to_reserve,
    CASE
      WHEN p_request_type = 'voice' THEN v_included_credit_to_reserve
      ELSE 0
    END,
    CASE
      WHEN p_request_type = 'text' AND v_text_topup_to_reserve > 0 THEN 'text_credit'::public.ai_topup_resource_type
      WHEN p_request_type = 'voice' AND v_voice_topup_to_reserve > 0 THEN 'voice_second'::public.ai_topup_resource_type
      WHEN p_request_type = 'receipt_extraction' AND v_receipt_topup_to_reserve > 0 THEN 'receipt_extraction'::public.ai_topup_resource_type
      ELSE NULL
    END,
    CASE
      WHEN p_request_type = 'text' THEN v_text_topup_to_reserve
      WHEN p_request_type = 'voice' THEN v_voice_topup_to_reserve
      WHEN p_request_type = 'receipt_extraction' THEN v_receipt_topup_to_reserve
      ELSE 0
    END,
    CASE
      WHEN p_request_type = 'voice' THEN v_credit_topup_to_reserve
      ELSE 0
    END,
    'Reserved before AI processing'
  )
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'ok', true,
    'cycle_id', v_cycle_id,
    'ledger_id', v_ledger_id,
    'credits_reserved', v_credit_cost,
    'duplicate', false,
    'request_type', p_request_type
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalise_ai_credits(
  p_user_id UUID,
  p_cycle_id UUID,
  p_ledger_id UUID,
  p_ai_request_id UUID DEFAULT NULL,
  p_input_tokens INTEGER DEFAULT NULL,
  p_output_tokens INTEGER DEFAULT NULL,
  p_total_tokens INTEGER DEFAULT NULL,
  p_speech_duration_ms INTEGER DEFAULT NULL,
  p_provider_name TEXT DEFAULT NULL,
  p_model_name TEXT DEFAULT NULL,
  p_estimated_cost NUMERIC DEFAULT NULL,
  p_credit_cost INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_request_type TEXT;
  v_credit_cost INTEGER;
  v_ledger_type public.credit_ledger_type;
  v_included_reserved INTEGER;
  v_included_credit_reserved INTEGER;
  v_topup_reserved INTEGER;
  v_topup_resource public.ai_topup_resource_type;
  v_credit_topup_reserved INTEGER;
  v_balance INTEGER;
  v_actual_voice_seconds INTEGER := GREATEST(COALESCE(CEIL(COALESCE(p_speech_duration_ms, 0)::NUMERIC / 1000)::INTEGER, 0), 0);
  v_voice_refund_seconds INTEGER := 0;
  v_topup_to_consume INTEGER;
  v_effective_voice_seconds INTEGER := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT
    COALESCE(request_type, 'text'),
    COALESCE(credit_cost, ABS(credits_delta), p_credit_cost),
    ledger_type,
    COALESCE(included_quantity_reserved, 0),
    COALESCE(included_credit_quantity_reserved, 0),
    COALESCE(topup_quantity_reserved, 0),
    topup_resource_type,
    COALESCE(credit_topup_quantity_reserved, 0)
  INTO
    v_request_type,
    v_credit_cost,
    v_ledger_type,
    v_included_reserved,
    v_included_credit_reserved,
    v_topup_reserved,
    v_topup_resource,
    v_credit_topup_reserved
  FROM public.ai_credit_ledger
  WHERE id = p_ledger_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_ledger_type = 'charge' THEN
    RETURN TRUE;
  END IF;

  IF v_ledger_type <> 'reservation' THEN
    RETURN FALSE;
  END IF;

  IF v_request_type = 'receipt_extraction' THEN
    UPDATE public.ai_usage_cycles
    SET
      receipt_extractions_reserved = GREATEST(0, receipt_extractions_reserved - v_included_reserved),
      receipt_extractions_consumed = receipt_extractions_consumed + v_included_reserved,
      updated_at = now()
    WHERE id = p_cycle_id
      AND user_id = p_user_id;

    IF v_topup_reserved > 0 THEN
      PERFORM public.adjust_ai_topup_balance(
        p_user_id,
        'receipt_extraction',
        0,
        -v_topup_reserved,
        0,
        v_topup_reserved,
        'consume',
        'completed',
        NULL,
        NULL,
        p_ledger_id,
        NULL,
        'ai_consumed',
        NULL,
        NULL,
        CONCAT('topup-finalise:', p_ledger_id::TEXT),
        jsonb_build_object('request_type', v_request_type)
      );
    END IF;
  ELSIF v_request_type = 'voice' THEN
    v_effective_voice_seconds := LEAST(v_actual_voice_seconds, v_included_reserved + v_topup_reserved);
    v_topup_to_consume := LEAST(v_topup_reserved, v_effective_voice_seconds);
    v_voice_refund_seconds := GREATEST(v_topup_reserved - v_topup_to_consume, 0);

    UPDATE public.ai_usage_cycles
    SET
      credits_reserved = GREATEST(0, credits_reserved - v_included_credit_reserved),
      credits_consumed = credits_consumed + v_included_credit_reserved,
      voice_seconds_reserved = GREATEST(0, voice_seconds_reserved - v_included_reserved),
      voice_seconds_used = voice_seconds_used + LEAST(v_included_reserved, v_effective_voice_seconds),
      updated_at = now()
    WHERE id = p_cycle_id
      AND user_id = p_user_id;

    IF v_topup_to_consume > 0 THEN
      PERFORM public.adjust_ai_topup_balance(
        p_user_id,
        'voice_second',
        0,
        -v_topup_to_consume,
        0,
        v_topup_to_consume,
        'consume',
        'completed',
        NULL,
        NULL,
        p_ledger_id,
        NULL,
        'ai_consumed',
        NULL,
        NULL,
        CONCAT('topup-finalise:', p_ledger_id::TEXT),
        jsonb_build_object('request_type', v_request_type)
      );
    END IF;

    IF v_credit_topup_reserved > 0 THEN
      PERFORM public.adjust_ai_topup_balance(
        p_user_id,
        'text_credit',
        0,
        -v_credit_topup_reserved,
        0,
        v_credit_topup_reserved,
        'consume',
        'completed',
        NULL,
        NULL,
        p_ledger_id,
        NULL,
        'ai_credit_consumed',
        NULL,
        NULL,
        CONCAT('topup-credit-finalise:', p_ledger_id::TEXT),
        jsonb_build_object('request_type', v_request_type, 'resource_type', 'text_credit')
      );
    END IF;

    IF v_voice_refund_seconds > 0 THEN
      PERFORM public.adjust_ai_topup_balance(
        p_user_id,
        'voice_second',
        v_voice_refund_seconds,
        -v_voice_refund_seconds,
        0,
        0,
        'refund',
        'completed',
        NULL,
        NULL,
        p_ledger_id,
        NULL,
        'voice_overreserve_refund',
        NULL,
        NULL,
        CONCAT('topup-finalise-refund:', p_ledger_id::TEXT),
        jsonb_build_object('request_type', v_request_type)
      );
    END IF;
  ELSE
    UPDATE public.ai_usage_cycles
    SET
      credits_reserved = GREATEST(0, credits_reserved - v_included_reserved),
      credits_consumed = credits_consumed + v_included_reserved,
      updated_at = now()
    WHERE id = p_cycle_id
      AND user_id = p_user_id;

    IF v_topup_reserved > 0 AND v_topup_resource = 'text_credit' THEN
      PERFORM public.adjust_ai_topup_balance(
        p_user_id,
        'text_credit',
        0,
        -v_topup_reserved,
        0,
        v_topup_reserved,
        'consume',
        'completed',
        NULL,
        NULL,
        p_ledger_id,
        NULL,
        'ai_consumed',
        NULL,
        NULL,
        CONCAT('topup-finalise:', p_ledger_id::TEXT),
        jsonb_build_object('request_type', v_request_type)
      );
    END IF;
  END IF;

  SELECT COALESCE(credits_allocated, 0) - COALESCE(credits_consumed, 0) - COALESCE(credits_reserved, 0)
  INTO v_balance
  FROM public.ai_usage_cycles
  WHERE id = p_cycle_id
    AND user_id = p_user_id;

  UPDATE public.ai_credit_ledger
  SET
    ledger_type = 'charge',
    ai_request_id = p_ai_request_id,
    input_tokens = p_input_tokens,
    output_tokens = p_output_tokens,
    total_tokens = p_total_tokens,
    speech_duration_ms = p_speech_duration_ms,
    provider_name = p_provider_name,
    model_name = p_model_name,
    estimated_cost_usd = p_estimated_cost,
    credit_cost = v_credit_cost,
    request_type = v_request_type,
    credits_balance_after = v_balance,
    included_quantity_consumed = v_included_reserved,
    included_credit_quantity_consumed = CASE
      WHEN v_request_type = 'voice' THEN v_included_credit_reserved
      ELSE 0
    END,
    topup_quantity_consumed = CASE
      WHEN v_request_type = 'voice' THEN LEAST(v_topup_reserved, v_effective_voice_seconds)
      ELSE v_topup_reserved
    END,
    topup_quantity_refunded = CASE
      WHEN v_request_type = 'voice' THEN GREATEST(v_topup_reserved - LEAST(v_topup_reserved, v_effective_voice_seconds), 0)
      ELSE 0
    END,
    credit_topup_quantity_consumed = CASE
      WHEN v_request_type = 'voice' THEN v_credit_topup_reserved
      ELSE 0
    END,
    credit_topup_quantity_refunded = 0
  WHERE id = p_ledger_id
    AND user_id = p_user_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_ai_credits(
  p_user_id UUID,
  p_cycle_id UUID,
  p_ledger_id UUID,
  p_reason TEXT DEFAULT 'provider_failure'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_credit_cost INTEGER;
  v_request_type TEXT;
  v_included_reserved INTEGER;
  v_included_credit_reserved INTEGER;
  v_topup_reserved INTEGER;
  v_topup_resource public.ai_topup_resource_type;
  v_credit_topup_reserved INTEGER;
  v_balance INTEGER;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT
    COALESCE(ABS(credits_delta), credit_cost, 1),
    COALESCE(request_type, 'text'),
    COALESCE(included_quantity_reserved, 0),
    COALESCE(topup_quantity_reserved, 0),
    topup_resource_type,
    COALESCE(included_credit_quantity_reserved, 0),
    COALESCE(credit_topup_quantity_reserved, 0)
  INTO
    v_credit_cost,
    v_request_type,
    v_included_reserved,
    v_topup_reserved,
    v_topup_resource,
    v_included_credit_reserved,
    v_credit_topup_reserved
  FROM public.ai_credit_ledger
  WHERE id = p_ledger_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF v_credit_cost IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_request_type = 'receipt_extraction' THEN
    UPDATE public.ai_usage_cycles
    SET
      receipt_extractions_reserved = GREATEST(0, receipt_extractions_reserved - v_included_reserved),
      receipt_extractions_refunded = receipt_extractions_refunded + v_included_reserved,
      updated_at = now()
    WHERE id = p_cycle_id
      AND user_id = p_user_id;

    IF v_topup_reserved > 0 AND v_topup_resource = 'receipt_extraction' THEN
      PERFORM public.adjust_ai_topup_balance(
        p_user_id,
        'receipt_extraction',
        v_topup_reserved,
        -v_topup_reserved,
        0,
        0,
        'refund',
        'completed',
        NULL,
        NULL,
        p_ledger_id,
        NULL,
        p_reason,
        NULL,
        NULL,
        CONCAT('topup-refund:', p_ledger_id::TEXT),
        jsonb_build_object('request_type', v_request_type)
      );
    END IF;
  ELSIF v_request_type = 'voice' THEN
    UPDATE public.ai_usage_cycles
    SET
      credits_reserved = GREATEST(0, credits_reserved - v_included_credit_reserved),
      credits_refunded = credits_refunded + v_included_credit_reserved,
      voice_seconds_reserved = GREATEST(0, voice_seconds_reserved - v_included_reserved),
      updated_at = now()
    WHERE id = p_cycle_id
      AND user_id = p_user_id;

    IF v_topup_reserved > 0 AND v_topup_resource = 'voice_second' THEN
      PERFORM public.adjust_ai_topup_balance(
        p_user_id,
        'voice_second',
        v_topup_reserved,
        -v_topup_reserved,
        0,
        0,
        'refund',
        'completed',
        NULL,
        NULL,
        p_ledger_id,
        NULL,
        p_reason,
        NULL,
        NULL,
        CONCAT('topup-refund:', p_ledger_id::TEXT),
        jsonb_build_object('request_type', v_request_type)
      );
    END IF;

    IF v_credit_topup_reserved > 0 THEN
      PERFORM public.adjust_ai_topup_balance(
        p_user_id,
        'text_credit',
        v_credit_topup_reserved,
        -v_credit_topup_reserved,
        0,
        0,
        'refund',
        'completed',
        NULL,
        NULL,
        p_ledger_id,
        NULL,
        p_reason,
        NULL,
        NULL,
        CONCAT('topup-credit-refund:', p_ledger_id::TEXT),
        jsonb_build_object('request_type', v_request_type, 'resource_type', 'text_credit')
      );
    END IF;
  ELSE
    UPDATE public.ai_usage_cycles
    SET
      credits_reserved = GREATEST(0, credits_reserved - v_included_reserved),
      credits_refunded = credits_refunded + v_included_reserved,
      updated_at = now()
    WHERE id = p_cycle_id
      AND user_id = p_user_id;

    IF v_topup_reserved > 0 AND v_topup_resource = 'text_credit' THEN
      PERFORM public.adjust_ai_topup_balance(
        p_user_id,
        'text_credit',
        v_topup_reserved,
        -v_topup_reserved,
        0,
        0,
        'refund',
        'completed',
        NULL,
        NULL,
        p_ledger_id,
        NULL,
        p_reason,
        NULL,
        NULL,
        CONCAT('topup-refund:', p_ledger_id::TEXT),
        jsonb_build_object('request_type', v_request_type)
      );
    END IF;
  END IF;

  SELECT COALESCE(credits_allocated, 0) - COALESCE(credits_consumed, 0) - COALESCE(credits_reserved, 0)
  INTO v_balance
  FROM public.ai_usage_cycles
  WHERE id = p_cycle_id
    AND user_id = p_user_id;

  UPDATE public.ai_credit_ledger
  SET
    was_refunded = true,
    notes = COALESCE(notes, '') || ' | Refunded: ' || p_reason,
    included_quantity_refunded = v_included_reserved,
    included_credit_quantity_refunded = CASE
      WHEN v_request_type = 'voice' THEN v_included_credit_reserved
      ELSE 0
    END,
    topup_quantity_refunded = v_topup_reserved,
    credit_topup_quantity_refunded = CASE
      WHEN v_request_type = 'voice' THEN v_credit_topup_reserved
      ELSE 0
    END,
    credits_balance_after = v_balance
  WHERE id = p_ledger_id
    AND user_id = p_user_id;

  INSERT INTO public.ai_credit_ledger (
    user_id,
    cycle_id,
    ledger_type,
    credits_delta,
    credits_balance_after,
    was_refunded,
    credit_cost,
    request_type,
    included_quantity_refunded,
    included_credit_quantity_refunded,
    topup_resource_type,
    topup_quantity_refunded,
    credit_topup_quantity_refunded,
    notes
  )
  VALUES (
    p_user_id,
    p_cycle_id,
    'refund',
    v_credit_cost,
    v_balance,
    true,
    v_credit_cost,
    v_request_type,
    v_included_reserved,
    CASE
      WHEN v_request_type = 'voice' THEN v_included_credit_reserved
      ELSE 0
    END,
    v_topup_resource,
    v_topup_reserved,
    CASE
      WHEN v_request_type = 'voice' THEN v_credit_topup_reserved
      ELSE 0
    END,
    'Refund: ' || p_reason
  );

  RETURN TRUE;
END;
$$;

ALTER TABLE public.ai_topup_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_topup_product_plan_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_topup_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_topup_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_topup_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_topup_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_topup_products_public_select" ON public.ai_topup_products;
CREATE POLICY "ai_topup_products_public_select"
  ON public.ai_topup_products FOR SELECT
  TO authenticated
  USING (
    active = true
    AND enabled = true
    AND public.can_purchase_ai_topups_for_user(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_subscriptions us
      JOIN public.subscription_plans sp ON sp.id = us.plan_id
      JOIN public.ai_topup_product_plan_eligibility eligibility
        ON eligibility.product_id = public.ai_topup_products.id
       AND eligibility.plan_code = sp.plan_code
      WHERE us.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ai_topup_products_admin_all" ON public.ai_topup_products;
CREATE POLICY "ai_topup_products_admin_all"
  ON public.ai_topup_products FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "ai_topup_product_plan_eligibility_public_select" ON public.ai_topup_product_plan_eligibility;
CREATE POLICY "ai_topup_product_plan_eligibility_public_select"
  ON public.ai_topup_product_plan_eligibility FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ai_topup_products p
      WHERE p.id = product_id
        AND p.active = true
        AND p.enabled = true
    )
  );

DROP POLICY IF EXISTS "ai_topup_product_plan_eligibility_admin_all" ON public.ai_topup_product_plan_eligibility;
CREATE POLICY "ai_topup_product_plan_eligibility_admin_all"
  ON public.ai_topup_product_plan_eligibility FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "ai_topup_orders_own_read" ON public.ai_topup_orders;
CREATE POLICY "ai_topup_orders_own_read"
  ON public.ai_topup_orders FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "ai_topup_orders_admin_all" ON public.ai_topup_orders;
CREATE POLICY "ai_topup_orders_admin_all"
  ON public.ai_topup_orders FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "ai_topup_order_items_own_read" ON public.ai_topup_order_items;
CREATE POLICY "ai_topup_order_items_own_read"
  ON public.ai_topup_order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ai_topup_orders o
      WHERE o.id = order_id
        AND o.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ai_topup_order_items_admin_all" ON public.ai_topup_order_items;
CREATE POLICY "ai_topup_order_items_admin_all"
  ON public.ai_topup_order_items FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "ai_topup_balances_own_read" ON public.ai_topup_balances;
CREATE POLICY "ai_topup_balances_own_read"
  ON public.ai_topup_balances FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "ai_topup_balances_admin_all" ON public.ai_topup_balances;
CREATE POLICY "ai_topup_balances_admin_all"
  ON public.ai_topup_balances FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "ai_topup_ledger_own_read" ON public.ai_topup_ledger;
CREATE POLICY "ai_topup_ledger_own_read"
  ON public.ai_topup_ledger FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "ai_topup_ledger_admin_all" ON public.ai_topup_ledger;
CREATE POLICY "ai_topup_ledger_admin_all"
  ON public.ai_topup_ledger FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "ai_requests_require_history_access_select" ON public.ai_requests;
CREATE POLICY "ai_requests_require_history_access_select"
  ON public.ai_requests
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user()
    OR
    user_id <> auth.uid()
    OR public.subscription_feature_enabled_for_current_user('ai_history')
  );

DROP POLICY IF EXISTS "ai_requests_require_history_access_update" ON public.ai_requests;
CREATE POLICY "ai_requests_require_history_access_update"
  ON public.ai_requests
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_user()
    OR
    user_id <> auth.uid()
    OR public.subscription_feature_enabled_for_current_user('ai_history')
  )
  WITH CHECK (
    public.is_admin_user()
    OR
    user_id <> auth.uid()
    OR public.subscription_feature_enabled_for_current_user('ai_history')
  );

DROP POLICY IF EXISTS "ai_requests_require_history_access_delete" ON public.ai_requests;
CREATE POLICY "ai_requests_require_history_access_delete"
  ON public.ai_requests
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_user()
    OR
    user_id <> auth.uid()
    OR public.subscription_feature_enabled_for_current_user('ai_history')
  );

DROP POLICY IF EXISTS "ai_feedback_require_history_access_select" ON public.ai_feedback;
CREATE POLICY "ai_feedback_require_history_access_select"
  ON public.ai_feedback
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user()
    OR
    user_id <> auth.uid()
    OR public.subscription_feature_enabled_for_current_user('ai_history')
  );

DROP POLICY IF EXISTS "ai_feedback_require_history_access_insert" ON public.ai_feedback;
CREATE POLICY "ai_feedback_require_history_access_insert"
  ON public.ai_feedback
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_user()
    OR
    user_id <> auth.uid()
    OR public.subscription_feature_enabled_for_current_user('ai_history')
  );

DROP POLICY IF EXISTS "ai_feedback_require_history_access_update" ON public.ai_feedback;
CREATE POLICY "ai_feedback_require_history_access_update"
  ON public.ai_feedback
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_user()
    OR
    user_id <> auth.uid()
    OR public.subscription_feature_enabled_for_current_user('ai_history')
  )
  WITH CHECK (
    public.is_admin_user()
    OR
    user_id <> auth.uid()
    OR public.subscription_feature_enabled_for_current_user('ai_history')
  );

DROP POLICY IF EXISTS "ai_feedback_require_history_access_delete" ON public.ai_feedback;
CREATE POLICY "ai_feedback_require_history_access_delete"
  ON public.ai_feedback
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_user()
    OR
    user_id <> auth.uid()
    OR public.subscription_feature_enabled_for_current_user('ai_history')
  );

DROP POLICY IF EXISTS "managed_people_require_feature" ON public.managed_people;
CREATE POLICY "managed_people_require_feature"
  ON public.managed_people
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('managed_people'))
  WITH CHECK (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('managed_people'));

DROP POLICY IF EXISTS "person_aliases_require_feature" ON public.person_aliases;
CREATE POLICY "person_aliases_require_feature"
  ON public.person_aliases
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('managed_people'))
  WITH CHECK (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('managed_people'));

DROP POLICY IF EXISTS "person_ledger_entries_require_feature" ON public.person_ledger_entries;
CREATE POLICY "person_ledger_entries_require_feature"
  ON public.person_ledger_entries
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('managed_people'))
  WITH CHECK (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('managed_people'));

DROP POLICY IF EXISTS "reimbursements_require_feature" ON public.reimbursements;
CREATE POLICY "reimbursements_require_feature"
  ON public.reimbursements
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('managed_people'))
  WITH CHECK (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('managed_people'));

DROP POLICY IF EXISTS "reimbursement_payments_require_feature" ON public.reimbursement_payments;
CREATE POLICY "reimbursement_payments_require_feature"
  ON public.reimbursement_payments
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('managed_people'))
  WITH CHECK (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('managed_people'));

DROP POLICY IF EXISTS "settlements_require_feature" ON public.settlements;
CREATE POLICY "settlements_require_feature"
  ON public.settlements
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('managed_people'))
  WITH CHECK (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('managed_people'));

DROP POLICY IF EXISTS "settlement_allocations_require_feature" ON public.settlement_allocations;
CREATE POLICY "settlement_allocations_require_feature"
  ON public.settlement_allocations
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('managed_people'))
  WITH CHECK (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('managed_people'));

DROP POLICY IF EXISTS "spaces_require_feature" ON public.spaces;
CREATE POLICY "spaces_require_feature"
  ON public.spaces
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('shared_spaces'))
  WITH CHECK (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('shared_spaces'));

DROP POLICY IF EXISTS "space_members_require_feature" ON public.space_members;
CREATE POLICY "space_members_require_feature"
  ON public.space_members
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('shared_spaces'))
  WITH CHECK (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('shared_spaces'));

DROP POLICY IF EXISTS "space_invitations_require_feature" ON public.space_invitations;
CREATE POLICY "space_invitations_require_feature"
  ON public.space_invitations
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('shared_spaces'))
  WITH CHECK (public.is_admin_user() OR public.subscription_feature_enabled_for_current_user('shared_spaces'));

INSERT INTO public.ai_topup_products (
  resource_type,
  enabled,
  active,
  name,
  description,
  unit_quantity,
  unit_label,
  price_amount,
  currency_code,
  minimum_quantity,
  maximum_quantity,
  quantity_step,
  sort_order,
  bundle_components,
  metadata
)
SELECT *
FROM (
  VALUES
    (
      'text_credit'::public.ai_topup_resource_type,
      true,
      false,
      'Extra Text AI Credits',
      'Adds extra text AI credits for Smart Entry and AI assistance.',
      100,
      'credits',
      5,
      'AED',
      1,
      20,
      1,
      10,
      NULL::jsonb,
      jsonb_build_object('seeded', true, 'preset', true, 'seed_code', 'text_credit_100_aed_5')
    ),
    (
      'voice_second'::public.ai_topup_resource_type,
      true,
      false,
      'Extra Voice AI Time',
      'Adds extra voice transcription allowance.',
      600,
      'seconds',
      4,
      'AED',
      1,
      20,
      1,
      20,
      NULL::jsonb,
      jsonb_build_object('seeded', true, 'preset', true, 'seed_code', 'voice_second_600_aed_4')
    ),
    (
      'receipt_extraction'::public.ai_topup_resource_type,
      true,
      false,
      'Extra Receipt Documents',
      'Adds extra receipt extraction documents.',
      10,
      'documents',
      5,
      'AED',
      1,
      20,
      1,
      30,
      NULL::jsonb,
      jsonb_build_object('seeded', true, 'preset', true, 'seed_code', 'receipt_extraction_10_aed_5')
    ),
    (
      'bundle'::public.ai_topup_resource_type,
      true,
      false,
      'AI Mix Bundle',
      'Adds a small mix of text, voice, and receipt usage.',
      1,
      'bundle',
      10,
      'AED',
      1,
      10,
      1,
      40,
      jsonb_build_object(
        'text_credit', 100,
        'voice_second', 300,
        'receipt_extraction', 5
      ),
      jsonb_build_object('seeded', true, 'preset', true, 'seed_code', 'bundle_mix_small_aed_10')
    )
) AS seed_rows (
  resource_type,
  enabled,
  active,
  name,
  description,
  unit_quantity,
  unit_label,
  price_amount,
  currency_code,
  minimum_quantity,
  maximum_quantity,
  quantity_step,
  sort_order,
  bundle_components,
  metadata
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.ai_topup_products existing
  WHERE existing.metadata ->> 'seed_code' = seed_rows.metadata ->> 'seed_code'
);

INSERT INTO public.ai_topup_product_plan_eligibility (product_id, plan_code)
SELECT p.id, eligibility.plan_code
FROM public.ai_topup_products p
CROSS JOIN (
  VALUES
    ('personal'::public.subscription_plan_code),
    ('family'::public.subscription_plan_code)
) AS eligibility(plan_code)
WHERE p.metadata ->> 'seeded' = 'true'
  AND NOT EXISTS (
    SELECT 1
    FROM public.ai_topup_product_plan_eligibility e
    WHERE e.product_id = p.id
      AND e.plan_code = eligibility.plan_code
  );

REVOKE ALL ON TABLE public.ai_topup_products FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ai_topup_product_plan_eligibility FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ai_topup_orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ai_topup_order_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ai_topup_balances FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ai_topup_ledger FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.ai_topup_products TO authenticated;
GRANT SELECT ON TABLE public.ai_topup_product_plan_eligibility TO authenticated;
GRANT SELECT ON TABLE public.ai_topup_orders TO authenticated;
GRANT SELECT ON TABLE public.ai_topup_order_items TO authenticated;
GRANT SELECT ON TABLE public.ai_topup_balances TO authenticated;
GRANT SELECT ON TABLE public.ai_topup_ledger TO authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE public.ai_topup_products TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.ai_topup_product_plan_eligibility TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_topup_products TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_topup_product_plan_eligibility TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_topup_orders TO service_role;
GRANT SELECT, INSERT ON TABLE public.ai_topup_order_items TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_topup_balances TO service_role;
GRANT SELECT, INSERT ON TABLE public.ai_topup_ledger TO service_role;

DO $$
DECLARE
  v_sequence RECORD;
BEGIN
  FOR v_sequence IN
    SELECT format('%I.%I', sequence_ns.nspname, sequence_rel.relname) AS sequence_name
    FROM pg_class sequence_rel
    JOIN pg_namespace sequence_ns ON sequence_ns.oid = sequence_rel.relnamespace
    JOIN pg_depend dep
      ON dep.objid = sequence_rel.oid
     AND dep.deptype = 'a'
    JOIN pg_class table_rel ON table_rel.oid = dep.refobjid
    JOIN pg_namespace table_ns ON table_ns.oid = table_rel.relnamespace
    WHERE sequence_rel.relkind = 'S'
      AND table_ns.nspname = 'public'
      AND table_rel.relname IN (
        'ai_topup_products',
        'ai_topup_product_plan_eligibility',
        'ai_topup_orders',
        'ai_topup_order_items',
        'ai_topup_balances',
        'ai_topup_ledger'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated;', v_sequence.sequence_name);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated, service_role;', v_sequence.sequence_name);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.is_subscription_operational(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_subscription_operational(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.subscription_feature_enabled_for_user(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscription_feature_enabled_for_user(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.subscription_feature_enabled_for_current_user(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscription_feature_enabled_for_current_user(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.subscription_ai_history_retention_days_for_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscription_ai_history_retention_days_for_user(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ensure_ai_topup_balance_row(UUID, public.ai_topup_resource_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_ai_topup_balance_row(UUID, public.ai_topup_resource_type) TO service_role;

REVOKE ALL ON FUNCTION public.adjust_ai_topup_balance(UUID, public.ai_topup_resource_type, INTEGER, INTEGER, INTEGER, INTEGER, public.ai_topup_ledger_entry_type, public.ai_topup_ledger_entry_status, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_ai_topup_balance(UUID, public.ai_topup_resource_type, INTEGER, INTEGER, INTEGER, INTEGER, public.ai_topup_ledger_entry_type, public.ai_topup_ledger_entry_status, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.ai_topup_available_quantity(UUID, public.ai_topup_resource_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_topup_available_quantity(UUID, public.ai_topup_resource_type) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_purchase_ai_topups_for_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_purchase_ai_topups_for_user(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ai_topup_reversal_available_quantity(UUID, public.ai_topup_resource_type, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_topup_reversal_available_quantity(UUID, public.ai_topup_resource_type, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.fulfill_ai_topup_order_payment(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fulfill_ai_topup_order_payment(UUID, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.reverse_ai_topup_order_payment(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_ai_topup_order_payment(UUID, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.admin_adjust_ai_topup_balance(UUID, UUID, public.ai_topup_resource_type, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_adjust_ai_topup_balance(UUID, UUID, public.ai_topup_resource_type, INTEGER, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cleanup_ai_history_retention(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_ai_history_retention(UUID, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.reserve_ai_credits(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_ai_credits(UUID, TEXT, TEXT, INTEGER) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
