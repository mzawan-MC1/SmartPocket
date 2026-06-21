BEGIN;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS significant_item_price_increase_alerts BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recurring_purchase_due_alerts BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS duplicate_receipt_warning_alerts BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unusual_receipt_total_alerts BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS high_item_or_category_spend_alerts BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.item_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  ai_suggested BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT item_identities_user_normalized_name_key UNIQUE (user_id, normalized_name)
);

CREATE TABLE IF NOT EXISTS public.item_identity_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  identity_id UUID NOT NULL REFERENCES public.item_identities(id) ON DELETE CASCADE,
  alias_name TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ai_suggested')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT item_identity_aliases_user_normalized_alias_key UNIQUE (user_id, normalized_alias)
);

CREATE INDEX IF NOT EXISTS idx_item_identities_user_id
  ON public.item_identities(user_id);

CREATE INDEX IF NOT EXISTS idx_item_identity_aliases_user_id
  ON public.item_identity_aliases(user_id);

CREATE INDEX IF NOT EXISTS idx_item_identity_aliases_identity_id
  ON public.item_identity_aliases(identity_id);

ALTER TABLE public.item_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_identity_aliases ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'item_identities'
      AND policyname = 'item_identities_select_own'
  ) THEN
    CREATE POLICY item_identities_select_own
      ON public.item_identities
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'item_identities'
      AND policyname = 'item_identities_insert_own'
  ) THEN
    CREATE POLICY item_identities_insert_own
      ON public.item_identities
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'item_identities'
      AND policyname = 'item_identities_update_own'
  ) THEN
    CREATE POLICY item_identities_update_own
      ON public.item_identities
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'item_identities'
      AND policyname = 'item_identities_delete_own'
  ) THEN
    CREATE POLICY item_identities_delete_own
      ON public.item_identities
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'item_identity_aliases'
      AND policyname = 'item_identity_aliases_select_own'
  ) THEN
    CREATE POLICY item_identity_aliases_select_own
      ON public.item_identity_aliases
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'item_identity_aliases'
      AND policyname = 'item_identity_aliases_insert_own'
  ) THEN
    CREATE POLICY item_identity_aliases_insert_own
      ON public.item_identity_aliases
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'item_identity_aliases'
      AND policyname = 'item_identity_aliases_update_own'
  ) THEN
    CREATE POLICY item_identity_aliases_update_own
      ON public.item_identity_aliases
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'item_identity_aliases'
      AND policyname = 'item_identity_aliases_delete_own'
  ) THEN
    CREATE POLICY item_identity_aliases_delete_own
      ON public.item_identity_aliases
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

COMMIT;
