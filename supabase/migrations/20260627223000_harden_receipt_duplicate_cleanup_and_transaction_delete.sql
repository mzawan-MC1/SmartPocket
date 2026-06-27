BEGIN;

CREATE OR REPLACE FUNCTION public.sync_transaction_document_active_links(
  p_user_id UUID,
  p_document_ids UUID[] DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  WITH target_documents AS (
    SELECT d.id, d.status
    FROM public.transaction_documents AS d
    WHERE d.user_id = p_user_id
      AND (p_document_ids IS NULL OR d.id = ANY(p_document_ids))
  ),
  saved_job_links AS (
    SELECT
      j.document_id,
      t.id AS transaction_id,
      t.transaction_date,
      t.created_at
    FROM public.document_extraction_jobs AS j
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(j.saved_transaction_ids) = 'array' THEN j.saved_transaction_ids
        ELSE '[]'::JSONB
      END
    ) AS saved(transaction_id_text)
    JOIN public.transactions AS t
      ON t.id::TEXT = saved.transaction_id_text
     AND t.user_id = p_user_id
    WHERE j.user_id = p_user_id
      AND j.document_id IN (SELECT id FROM target_documents)
  ),
  primary_links AS (
    SELECT
      d.id AS document_id,
      t.id AS transaction_id,
      t.transaction_date,
      t.created_at
    FROM public.transaction_documents AS d
    JOIN public.transactions AS t
      ON t.id = d.primary_transaction_id
     AND t.user_id = p_user_id
    WHERE d.id IN (SELECT id FROM target_documents)
      AND d.user_id = p_user_id
  ),
  item_links AS (
    SELECT
      ti.document_id,
      t.id AS transaction_id,
      t.transaction_date,
      t.created_at
    FROM public.transaction_items AS ti
    JOIN public.transactions AS t
      ON t.id = ti.transaction_id
     AND t.user_id = p_user_id
    WHERE ti.user_id = p_user_id
      AND ti.document_id IN (SELECT id FROM target_documents)
  ),
  attachment_links AS (
    SELECT
      d.id AS document_id,
      t.id AS transaction_id,
      t.transaction_date,
      t.created_at
    FROM public.transaction_documents AS d
    JOIN public.receipt_attachments AS ra
      ON ra.file_url = d.storage_path
     AND ra.user_id = p_user_id
    JOIN public.transactions AS t
      ON t.id = ra.transaction_id
     AND t.user_id = p_user_id
    WHERE d.id IN (SELECT id FROM target_documents)
      AND d.user_id = p_user_id
  ),
  all_links AS (
    SELECT * FROM saved_job_links
    UNION ALL
    SELECT * FROM primary_links
    UNION ALL
    SELECT * FROM item_links
    UNION ALL
    SELECT * FROM attachment_links
  ),
  unique_links AS (
    SELECT DISTINCT ON (document_id, transaction_id)
      document_id,
      transaction_id,
      transaction_date,
      created_at
    FROM all_links
    ORDER BY document_id, transaction_id, transaction_date ASC NULLS LAST, created_at ASC NULLS LAST
  ),
  canonical_primary_links AS (
    SELECT DISTINCT ON (document_id)
      document_id,
      transaction_id
    FROM unique_links
    ORDER BY document_id, transaction_date ASC NULLS LAST, created_at ASC NULLS LAST, transaction_id ASC
  ),
  link_counts AS (
    SELECT
      document_id,
      COUNT(*)::INTEGER AS active_count
    FROM unique_links
    GROUP BY document_id
  )
  UPDATE public.transaction_documents AS d
  SET
    primary_transaction_id = cpl.transaction_id,
    linked_transaction_count = COALESCE(lc.active_count, 0),
    status = CASE
      WHEN COALESCE(lc.active_count, 0) > 0 THEN 'saved'::public.transaction_document_status
      WHEN d.status = 'saved'::public.transaction_document_status THEN 'review_ready'::public.transaction_document_status
      ELSE d.status
    END,
    updated_at = CURRENT_TIMESTAMP
  FROM target_documents AS td
  LEFT JOIN canonical_primary_links AS cpl
    ON cpl.document_id = td.id
  LEFT JOIN link_counts AS lc
    ON lc.document_id = td.id
  WHERE d.id = td.id;

  WITH target_documents AS (
    SELECT d.id
    FROM public.transaction_documents AS d
    WHERE d.user_id = p_user_id
      AND (p_document_ids IS NULL OR d.id = ANY(p_document_ids))
  ),
  saved_job_links AS (
    SELECT
      j.document_id,
      t.id AS transaction_id,
      t.transaction_date,
      t.created_at
    FROM public.document_extraction_jobs AS j
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(j.saved_transaction_ids) = 'array' THEN j.saved_transaction_ids
        ELSE '[]'::JSONB
      END
    ) AS saved(transaction_id_text)
    JOIN public.transactions AS t
      ON t.id::TEXT = saved.transaction_id_text
     AND t.user_id = p_user_id
    WHERE j.user_id = p_user_id
      AND j.document_id IN (SELECT id FROM target_documents)
  ),
  primary_links AS (
    SELECT
      d.id AS document_id,
      t.id AS transaction_id,
      t.transaction_date,
      t.created_at
    FROM public.transaction_documents AS d
    JOIN public.transactions AS t
      ON t.id = d.primary_transaction_id
     AND t.user_id = p_user_id
    WHERE d.id IN (SELECT id FROM target_documents)
      AND d.user_id = p_user_id
  ),
  item_links AS (
    SELECT
      ti.document_id,
      t.id AS transaction_id,
      t.transaction_date,
      t.created_at
    FROM public.transaction_items AS ti
    JOIN public.transactions AS t
      ON t.id = ti.transaction_id
     AND t.user_id = p_user_id
    WHERE ti.user_id = p_user_id
      AND ti.document_id IN (SELECT id FROM target_documents)
  ),
  attachment_links AS (
    SELECT
      d.id AS document_id,
      t.id AS transaction_id,
      t.transaction_date,
      t.created_at
    FROM public.transaction_documents AS d
    JOIN public.receipt_attachments AS ra
      ON ra.file_url = d.storage_path
     AND ra.user_id = p_user_id
    JOIN public.transactions AS t
      ON t.id = ra.transaction_id
     AND t.user_id = p_user_id
    WHERE d.id IN (SELECT id FROM target_documents)
      AND d.user_id = p_user_id
  ),
  all_links AS (
    SELECT * FROM saved_job_links
    UNION ALL
    SELECT * FROM primary_links
    UNION ALL
    SELECT * FROM item_links
    UNION ALL
    SELECT * FROM attachment_links
  ),
  unique_links AS (
    SELECT DISTINCT ON (document_id, transaction_id)
      document_id,
      transaction_id,
      transaction_date,
      created_at
    FROM all_links
    ORDER BY document_id, transaction_id, transaction_date ASC NULLS LAST, created_at ASC NULLS LAST
  ),
  saved_ids AS (
    SELECT
      td.id AS document_id,
      COALESCE(
        jsonb_agg(to_jsonb(ul.transaction_id::TEXT) ORDER BY ul.transaction_date ASC NULLS LAST, ul.created_at ASC NULLS LAST)
          FILTER (WHERE ul.transaction_id IS NOT NULL),
        '[]'::JSONB
      ) AS active_saved_transaction_ids
    FROM target_documents AS td
    LEFT JOIN unique_links AS ul
      ON ul.document_id = td.id
    GROUP BY td.id
  )
  UPDATE public.document_extraction_jobs AS j
  SET
    saved_transaction_ids = saved_ids.active_saved_transaction_ids,
    updated_at = CURRENT_TIMESTAMP
  FROM saved_ids
  WHERE j.user_id = p_user_id
    AND j.document_id = saved_ids.document_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_transaction_document_active_links(UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_transaction_document_active_links(UUID, UUID[]) FROM anon;
REVOKE ALL ON FUNCTION public.sync_transaction_document_active_links(UUID, UUID[]) FROM authenticated;

CREATE OR REPLACE FUNCTION public.rpc_delete_transaction_and_cleanup_receipt_links(
  p_transaction_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  deleted_transaction_id UUID,
  affected_document_ids JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id UUID := auth.uid();
  v_auth_role TEXT := auth.role();
  v_user_id UUID := COALESCE(v_auth_user_id, p_user_id);
  v_document_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF p_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Transaction id is required';
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  IF v_auth_user_id IS NOT NULL
     AND v_auth_user_id <> v_user_id
     AND COALESCE(v_auth_role, '') <> 'service_role' THEN
    RAISE EXCEPTION 'Cannot delete another user''s transaction';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.transactions AS t
    WHERE t.id = p_transaction_id
      AND t.user_id = v_user_id
  ) THEN
    RETURN;
  END IF;

  WITH affected_documents AS (
    SELECT DISTINCT document_id
    FROM (
      SELECT d.id AS document_id
      FROM public.transaction_documents AS d
      WHERE d.user_id = v_user_id
        AND d.primary_transaction_id = p_transaction_id

      UNION

      SELECT ti.document_id
      FROM public.transaction_items AS ti
      WHERE ti.user_id = v_user_id
        AND ti.transaction_id = p_transaction_id
        AND ti.document_id IS NOT NULL

      UNION

      SELECT d.id AS document_id
      FROM public.transaction_documents AS d
      JOIN public.receipt_attachments AS ra
        ON ra.file_url = d.storage_path
       AND ra.user_id = v_user_id
      WHERE d.user_id = v_user_id
        AND ra.transaction_id = p_transaction_id

      UNION

      SELECT j.document_id
      FROM public.document_extraction_jobs AS j
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(j.saved_transaction_ids) = 'array' THEN j.saved_transaction_ids
          ELSE '[]'::JSONB
        END
      ) AS saved(transaction_id_text)
      WHERE j.user_id = v_user_id
        AND saved.transaction_id_text = p_transaction_id::TEXT
    ) AS affected
    WHERE document_id IS NOT NULL
  )
  SELECT COALESCE(array_agg(document_id), ARRAY[]::UUID[])
  INTO v_document_ids
  FROM affected_documents;

  DELETE FROM public.transactions AS t
  WHERE t.id = p_transaction_id
    AND t.user_id = v_user_id;

  PERFORM public.sync_transaction_document_active_links(
    v_user_id,
    CASE
      WHEN array_length(v_document_ids, 1) IS NULL THEN NULL
      ELSE v_document_ids
    END
  );

  deleted_transaction_id := p_transaction_id;
  affected_document_ids := COALESCE(to_jsonb(v_document_ids), '[]'::JSONB);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_transaction_and_cleanup_receipt_links(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_delete_transaction_and_cleanup_receipt_links(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_delete_transaction_and_cleanup_receipt_links(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delete_transaction_and_cleanup_receipt_links(UUID, UUID) TO authenticated, service_role;

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  FOR v_user_id IN
    SELECT id
    FROM public.user_profiles
  LOOP
    PERFORM public.sync_transaction_document_active_links(v_user_id, NULL);
  END LOOP;
END;
$$;

COMMIT;
