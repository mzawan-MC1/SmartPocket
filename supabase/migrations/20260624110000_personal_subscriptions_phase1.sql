-- ============================================================
-- Smart Pocket Phase 1 — Personal Subscriptions
-- Migration: 20260624110000_personal_subscriptions_phase1.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.personal_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  provider TEXT,
  description TEXT,

  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  financial_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  recurring_transaction_id UUID REFERENCES public.recurring_transactions(id) ON DELETE SET NULL,

  amount NUMERIC(14,2) NOT NULL,
  currency_code TEXT NOT NULL,

  billing_frequency TEXT NOT NULL,
  billing_interval INTEGER NOT NULL DEFAULT 1,

  start_date DATE,
  next_billing_date DATE,
  trial_end_date DATE,
  contract_end_date DATE,

  auto_renew BOOLEAN NOT NULL DEFAULT true,
  payment_method TEXT,

  cancellation_notice_days INTEGER NOT NULL DEFAULT 0,
  cancellation_deadline DATE,

  reminder_days_before INTEGER[] NOT NULL DEFAULT ARRAY[1,3,7]::INTEGER[],
  warning_threshold_amount NUMERIC(14,2),

  website_url TEXT,
  account_reference TEXT,
  notes TEXT,

  status TEXT NOT NULL DEFAULT 'active',

  last_paid_date DATE,
  cancel_requested_at TIMESTAMPTZ,
  cancel_effective_date DATE,
  cancel_confirmation_reference TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT personal_subscriptions_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT personal_subscriptions_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT personal_subscriptions_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT personal_subscriptions_billing_frequency_check CHECK (
    billing_frequency IN ('weekly', 'monthly', 'quarterly', 'semi_annual', 'yearly', 'custom')
  ),
  CONSTRAINT personal_subscriptions_billing_interval_positive CHECK (billing_interval >= 1),
  CONSTRAINT personal_subscriptions_status_check CHECK (
    status IN ('trial', 'active', 'paused', 'cancellation_requested', 'cancelling', 'cancelled', 'expired')
  ),
  CONSTRAINT personal_subscriptions_payment_method_check CHECK (
    payment_method IS NULL
    OR payment_method IN (
      'Credit Card',
      'Debit Card',
      'Bank Account',
      'PayPal',
      'Cash',
      'Apple Pay',
      'Google Pay',
      'Other'
    )
  ),
  CONSTRAINT personal_subscriptions_cancellation_notice_non_negative CHECK (cancellation_notice_days >= 0),
  CONSTRAINT personal_subscriptions_warning_threshold_non_negative CHECK (
    warning_threshold_amount IS NULL OR warning_threshold_amount >= 0
  ),
  CONSTRAINT personal_subscriptions_reminder_days_allowed CHECK (
    reminder_days_before <@ ARRAY[1,3,7,14,30]::INTEGER[]
  ),
  CONSTRAINT personal_subscriptions_cancel_effective_after_request CHECK (
    cancel_requested_at IS NULL
    OR cancel_effective_date IS NULL
    OR cancel_effective_date >= cancel_requested_at::date
  )
);

CREATE INDEX IF NOT EXISTS idx_personal_subscriptions_user_id
  ON public.personal_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_personal_subscriptions_next_billing_date
  ON public.personal_subscriptions(next_billing_date);

CREATE INDEX IF NOT EXISTS idx_personal_subscriptions_trial_end_date
  ON public.personal_subscriptions(trial_end_date);

CREATE INDEX IF NOT EXISTS idx_personal_subscriptions_cancellation_deadline
  ON public.personal_subscriptions(cancellation_deadline);

CREATE INDEX IF NOT EXISTS idx_personal_subscriptions_status
  ON public.personal_subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_personal_subscriptions_financial_account_id
  ON public.personal_subscriptions(financial_account_id);

CREATE INDEX IF NOT EXISTS idx_personal_subscriptions_category_id
  ON public.personal_subscriptions(category_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_subscriptions_recurring_transaction
  ON public.personal_subscriptions(recurring_transaction_id)
  WHERE recurring_transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_personal_subscription_relationships()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  linked_account_user_id UUID;
  linked_category_user_id UUID;
  linked_category_is_system BOOLEAN;
  linked_category_type public.category_type;
  linked_recurring_user_id UUID;
  linked_recurring_type public.transaction_type;
BEGIN
  IF NEW.financial_account_id IS NOT NULL THEN
    SELECT fa.user_id
    INTO linked_account_user_id
    FROM public.financial_accounts AS fa
    WHERE fa.id = NEW.financial_account_id;

    IF linked_account_user_id IS NULL OR linked_account_user_id <> NEW.user_id THEN
      RAISE EXCEPTION 'Selected financial account does not belong to this user';
    END IF;
  END IF;

  IF NEW.category_id IS NOT NULL THEN
    SELECT c.user_id, c.is_system, c.category_type
    INTO linked_category_user_id, linked_category_is_system, linked_category_type
    FROM public.categories AS c
    WHERE c.id = NEW.category_id;

    IF linked_category_is_system IS NULL THEN
      RAISE EXCEPTION 'Selected category does not exist';
    END IF;

    IF COALESCE(linked_category_is_system, FALSE) = FALSE AND linked_category_user_id <> NEW.user_id THEN
      RAISE EXCEPTION 'Selected category does not belong to this user';
    END IF;

    IF linked_category_type <> 'expense' THEN
      RAISE EXCEPTION 'Selected category must be an expense category';
    END IF;
  END IF;

  IF NEW.recurring_transaction_id IS NOT NULL THEN
    SELECT rt.user_id, rt.transaction_type
    INTO linked_recurring_user_id, linked_recurring_type
    FROM public.recurring_transactions AS rt
    WHERE rt.id = NEW.recurring_transaction_id;

    IF linked_recurring_user_id IS NULL OR linked_recurring_user_id <> NEW.user_id THEN
      RAISE EXCEPTION 'Selected recurring transaction does not belong to this user';
    END IF;

    IF linked_recurring_type <> 'expense' THEN
      RAISE EXCEPTION 'Linked recurring transaction must be an expense';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_personal_subscription_relationships
  ON public.personal_subscriptions;

CREATE TRIGGER validate_personal_subscription_relationships
  BEFORE INSERT OR UPDATE ON public.personal_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_personal_subscription_relationships();

DROP TRIGGER IF EXISTS set_updated_at_personal_subscriptions
  ON public.personal_subscriptions;

CREATE TRIGGER set_updated_at_personal_subscriptions
  BEFORE UPDATE ON public.personal_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.personal_subscriptions
  TO authenticated;

ALTER TABLE public.personal_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_personal_subscriptions" ON public.personal_subscriptions;

CREATE POLICY "users_manage_own_personal_subscriptions"
  ON public.personal_subscriptions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
