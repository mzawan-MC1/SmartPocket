-- ============================================================
-- Smart Pocket Phase 1: AI Receipt / Document to Transaction
-- Additive only. Do not run automatically from the app.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.transaction_document_source_surface AS ENUM (
    'add_transaction',
    'smart_entry'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.transaction_document_status AS ENUM (
    'uploaded',
    'review_ready',
    'saved',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.document_extraction_job_status AS ENUM (
    'parsed',
    'failed',
    'saved'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.transaction_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  primary_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'receipts',
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  page_count INTEGER,
  sha256_hash TEXT NOT NULL,
  source_surface public.transaction_document_source_surface NOT NULL DEFAULT 'add_transaction',
  status public.transaction_document_status NOT NULL DEFAULT 'uploaded',
  merchant_name TEXT,
  document_date DATE,
  total_amount NUMERIC(15,2),
  tax_amount NUMERIC(15,2),
  currency_code TEXT,
  receipt_number TEXT,
  linked_transaction_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_documents_storage_path
  ON public.transaction_documents(storage_bucket, storage_path);
CREATE INDEX IF NOT EXISTS idx_transaction_documents_user_created
  ON public.transaction_documents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transaction_documents_user_sha256
  ON public.transaction_documents(user_id, sha256_hash);
CREATE INDEX IF NOT EXISTS idx_transaction_documents_user_summary
  ON public.transaction_documents(user_id, merchant_name, document_date, total_amount);
CREATE INDEX IF NOT EXISTS idx_transaction_documents_user_receipt_number
  ON public.transaction_documents(user_id, receipt_number)
  WHERE receipt_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.transaction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.transaction_documents(id) ON DELETE SET NULL,
  line_index INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC(15,3),
  unit_price NUMERIC(15,2),
  line_total NUMERIC(15,2),
  currency TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction
  ON public.transaction_items(transaction_id, line_index);
CREATE INDEX IF NOT EXISTS idx_transaction_items_document
  ON public.transaction_items(document_id, line_index);
CREATE INDEX IF NOT EXISTS idx_transaction_items_user_created
  ON public.transaction_items(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.document_extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.transaction_documents(id) ON DELETE CASCADE,
  source_surface public.transaction_document_source_surface NOT NULL DEFAULT 'add_transaction',
  status public.document_extraction_job_status NOT NULL DEFAULT 'parsed',
  provider_used TEXT,
  model_used TEXT,
  parsed_result JSONB,
  reviewed_result JSONB,
  duplicate_matches JSONB NOT NULL DEFAULT '[]'::JSONB,
  raw_ai_output JSONB,
  saved_transaction_ids JSONB NOT NULL DEFAULT '[]'::JSONB,
  duplicate_confirmed BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_document_extraction_jobs_user_created
  ON public.document_extraction_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_extraction_jobs_document
  ON public.document_extraction_jobs(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_extraction_jobs_status
  ON public.document_extraction_jobs(status, created_at DESC);

ALTER TABLE public.transaction_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_extraction_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_transaction_documents" ON public.transaction_documents;
CREATE POLICY "users_manage_own_transaction_documents" ON public.transaction_documents
FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_manage_own_transaction_items" ON public.transaction_items;
CREATE POLICY "users_manage_own_transaction_items" ON public.transaction_items
FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_manage_own_document_extraction_jobs" ON public.document_extraction_jobs;
CREATE POLICY "users_manage_own_document_extraction_jobs" ON public.document_extraction_jobs
FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS set_updated_at_transaction_documents ON public.transaction_documents;
CREATE TRIGGER set_updated_at_transaction_documents
  BEFORE UPDATE ON public.transaction_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_transaction_items ON public.transaction_items;
CREATE TRIGGER set_updated_at_transaction_items
  BEFORE UPDATE ON public.transaction_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_document_extraction_jobs ON public.document_extraction_jobs;
CREATE TRIGGER set_updated_at_document_extraction_jobs
  BEFORE UPDATE ON public.document_extraction_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage policy alignment for private document staging
DROP POLICY IF EXISTS "receipts: owner update" ON storage.objects;
CREATE POLICY "receipts: owner update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE OR REPLACE FUNCTION public.rpc_save_transaction_document_review(
  p_job_id UUID,
  p_reviewed_transactions JSONB,
  p_duplicate_confirmed BOOLEAN DEFAULT false
)
RETURNS TABLE (
  document_id UUID,
  primary_transaction_id UUID,
  transaction_ids JSONB,
  saved_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_job RECORD;
  v_tx JSONB;
  v_line JSONB;
  v_transaction_id UUID;
  v_primary_transaction_id UUID := NULL;
  v_transaction_ids JSONB := '[]'::JSONB;
  v_saved_count INTEGER := 0;
  v_account_id UUID;
  v_account RECORD;
  v_category_id UUID;
  v_category RECORD;
  v_amount NUMERIC(15,2);
  v_tax NUMERIC(15,2);
  v_currency TEXT;
  v_description TEXT;
  v_merchant TEXT;
  v_notes TEXT;
  v_receipt_number TEXT;
  v_transaction_date DATE;
  v_transaction_type TEXT;
  v_item_index INTEGER;
  v_account_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'Document extraction job id is required';
  END IF;

  IF jsonb_typeof(p_reviewed_transactions) <> 'array' OR jsonb_array_length(p_reviewed_transactions) = 0 THEN
    RAISE EXCEPTION 'At least one reviewed transaction is required';
  END IF;

  SELECT
    j.id,
    j.user_id,
    j.document_id,
    j.status AS job_status,
    d.storage_bucket,
    d.storage_path,
    d.file_name,
    d.file_size,
    d.mime_type,
    d.status AS document_status
  INTO v_job
  FROM public.document_extraction_jobs AS j
  JOIN public.transaction_documents AS d
    ON d.id = j.document_id
  WHERE j.id = p_job_id
    AND j.user_id = v_user_id
    AND d.user_id = v_user_id
  FOR UPDATE OF j, d;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document extraction job was not found';
  END IF;

  IF v_job.job_status = 'saved' OR v_job.document_status = 'saved' THEN
    RAISE EXCEPTION 'This document review has already been saved';
  END IF;

  FOR v_tx IN
    SELECT value FROM jsonb_array_elements(p_reviewed_transactions)
  LOOP
    v_transaction_type := CASE
      WHEN LOWER(COALESCE(v_tx->>'transactionType', 'expense')) = 'income' THEN 'income'
      ELSE 'expense'
    END;

    v_account_id := NULLIF(BTRIM(v_tx->>'accountId'), '')::UUID;
    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'Each reviewed transaction must include an account';
    END IF;

    SELECT id, user_id, currency, is_active, opening_balance
    INTO v_account
    FROM public.financial_accounts
    WHERE id = v_account_id
      AND user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Selected account was not found';
    END IF;

    IF NOT COALESCE(v_account.is_active, true) THEN
      RAISE EXCEPTION 'Selected account is inactive';
    END IF;

    v_currency := UPPER(COALESCE(NULLIF(BTRIM(v_tx->>'currency'), ''), v_account.currency, 'USD'));
    IF v_currency <> UPPER(BTRIM(v_account.currency)) THEN
      RAISE EXCEPTION 'Reviewed transaction currency must match the selected account currency (%)', v_account.currency;
    END IF;

    v_amount := ROUND(COALESCE(NULLIF(BTRIM(v_tx->>'amount'), '')::NUMERIC, 0), 2);
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'Reviewed transaction amount must be greater than 0';
    END IF;

    v_transaction_date := NULLIF(BTRIM(v_tx->>'transactionDate'), '')::DATE;
    IF v_transaction_date IS NULL THEN
      RAISE EXCEPTION 'Reviewed transaction date is required';
    END IF;

    v_category_id := NULLIF(BTRIM(v_tx->>'categoryId'), '')::UUID;
    IF v_category_id IS NOT NULL THEN
      SELECT id, category_type
      INTO v_category
      FROM public.categories
      WHERE id = v_category_id
        AND (user_id = v_user_id OR is_system = true);

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected category was not found';
      END IF;

      IF v_category.category_type::TEXT <> v_transaction_type THEN
        RAISE EXCEPTION 'Selected category does not match the reviewed transaction type';
      END IF;
    END IF;

    v_merchant := NULLIF(BTRIM(v_tx->>'merchant'), '');
    v_notes := NULLIF(BTRIM(v_tx->>'notes'), '');
    v_receipt_number := NULLIF(BTRIM(v_tx->>'receiptNumber'), '');
    v_description := COALESCE(NULLIF(BTRIM(v_tx->>'description'), ''), v_merchant, 'Document transaction');
    v_tax := CASE
      WHEN jsonb_typeof(v_tx->'tax') = 'number' THEN ROUND((v_tx->>'tax')::NUMERIC, 2)
      ELSE NULL
    END;

    INSERT INTO public.transactions (
      user_id,
      account_id,
      category_id,
      transaction_type,
      amount,
      currency,
      description,
      merchant,
      notes,
      transaction_date,
      tags,
      is_recurring
    )
    VALUES (
      v_user_id,
      v_account_id,
      v_category_id,
      v_transaction_type::public.transaction_type,
      v_amount,
      v_currency,
      v_description,
      v_merchant,
      v_notes,
      v_transaction_date,
      ARRAY[]::TEXT[],
      false
    )
    RETURNING id INTO v_transaction_id;

    INSERT INTO public.receipt_attachments (
      transaction_id,
      user_id,
      file_name,
      file_url,
      file_size,
      mime_type
    )
    VALUES (
      v_transaction_id,
      v_user_id,
      v_job.file_name,
      v_job.storage_path,
      v_job.file_size,
      v_job.mime_type
    );

    IF jsonb_typeof(v_tx->'lineItems') = 'array' THEN
      v_item_index := 0;
      FOR v_line IN
        SELECT value FROM jsonb_array_elements(v_tx->'lineItems')
      LOOP
        INSERT INTO public.transaction_items (
          user_id,
          transaction_id,
          document_id,
          line_index,
          name,
          description,
          quantity,
          unit_price,
          line_total,
          currency,
          raw_data
        )
        VALUES (
          v_user_id,
          v_transaction_id,
          v_job.document_id,
          v_item_index,
          COALESCE(NULLIF(BTRIM(v_line->>'name'), ''), 'Item'),
          NULLIF(BTRIM(v_line->>'description'), ''),
          CASE WHEN jsonb_typeof(v_line->'quantity') = 'number' THEN ROUND((v_line->>'quantity')::NUMERIC, 3) ELSE NULL END,
          CASE WHEN jsonb_typeof(v_line->'unitPrice') = 'number' THEN ROUND((v_line->>'unitPrice')::NUMERIC, 2) ELSE NULL END,
          CASE WHEN jsonb_typeof(v_line->'total') = 'number' THEN ROUND((v_line->>'total')::NUMERIC, 2) ELSE NULL END,
          v_currency,
          v_line
        );
        v_item_index := v_item_index + 1;
      END LOOP;
    END IF;

    IF v_primary_transaction_id IS NULL THEN
      v_primary_transaction_id := v_transaction_id;
    END IF;

    v_transaction_ids := v_transaction_ids || to_jsonb(v_transaction_id);
    v_saved_count := v_saved_count + 1;

    IF NOT (v_account_id = ANY(v_account_ids)) THEN
      v_account_ids := array_append(v_account_ids, v_account_id);
    END IF;
  END LOOP;

  UPDATE public.document_extraction_jobs
  SET
    status = 'saved',
    reviewed_result = p_reviewed_transactions,
    duplicate_confirmed = COALESCE(p_duplicate_confirmed, false),
    saved_transaction_ids = v_transaction_ids,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_job_id
    AND user_id = v_user_id;

  UPDATE public.transaction_documents
  SET
    primary_transaction_id = v_primary_transaction_id,
    linked_transaction_count = v_saved_count,
    merchant_name = COALESCE(NULLIF(BTRIM(p_reviewed_transactions->0->>'merchant'), ''), merchant_name),
    document_date = COALESCE(NULLIF(BTRIM(p_reviewed_transactions->0->>'transactionDate'), '')::DATE, document_date),
    total_amount = CASE
      WHEN jsonb_typeof(p_reviewed_transactions->0->'amount') = 'number' THEN ROUND((p_reviewed_transactions->0->>'amount')::NUMERIC, 2)
      ELSE total_amount
    END,
    tax_amount = CASE
      WHEN jsonb_typeof(p_reviewed_transactions->0->'tax') = 'number' THEN ROUND((p_reviewed_transactions->0->>'tax')::NUMERIC, 2)
      ELSE tax_amount
    END,
    currency_code = COALESCE(NULLIF(BTRIM(p_reviewed_transactions->0->>'currency'), ''), currency_code),
    receipt_number = COALESCE(NULLIF(BTRIM(p_reviewed_transactions->0->>'receiptNumber'), ''), receipt_number),
    status = 'saved',
    updated_at = CURRENT_TIMESTAMP
  WHERE id = v_job.document_id
    AND user_id = v_user_id;

  FOREACH v_account_id IN ARRAY v_account_ids
  LOOP
    UPDATE public.financial_accounts AS fa
    SET current_balance = fa.opening_balance
      + COALESCE((
        SELECT SUM(t.amount)
        FROM public.transactions AS t
        WHERE t.account_id = fa.id
          AND t.user_id = v_user_id
          AND t.transaction_type = 'income'
      ), 0)
      - COALESCE((
        SELECT SUM(t.amount)
        FROM public.transactions AS t
        WHERE t.account_id = fa.id
          AND t.user_id = v_user_id
          AND t.transaction_type = 'expense'
      ), 0)
      + COALESCE((
        SELECT SUM(tr.amount)
        FROM public.transfers AS tr
        WHERE tr.to_account_id = fa.id
          AND tr.user_id = v_user_id
      ), 0)
      - COALESCE((
        SELECT SUM(tr.amount)
        FROM public.transfers AS tr
        WHERE tr.from_account_id = fa.id
          AND tr.user_id = v_user_id
      ), 0)
    WHERE fa.id = v_account_id
      AND fa.user_id = v_user_id;
  END LOOP;

  document_id := v_job.document_id;
  primary_transaction_id := v_primary_transaction_id;
  transaction_ids := v_transaction_ids;
  saved_count := v_saved_count;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_save_transaction_document_review(UUID, JSONB, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_save_transaction_document_review(UUID, JSONB, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_save_transaction_document_review(UUID, JSONB, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_save_transaction_document_review(UUID, JSONB, BOOLEAN) TO authenticated;
