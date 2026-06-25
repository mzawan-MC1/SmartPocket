-- ============================================================
-- Smart Pocket — Support Centre
-- Migration: 20260625183000_support_centre.sql
-- Notes:
--   1. Reuses and extends public.contact_submissions safely.
--   2. Creates support ticket, message, attachment, and event tables.
--   3. Adds private storage policies for the manual "support-attachments" bucket.
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS public.contact_reference_number_seq START WITH 1000;
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq START WITH 1000;

CREATE OR REPLACE FUNCTION public.generate_contact_reference_number()
RETURNS TEXT
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT format('CE-%s-%06s', to_char(CURRENT_DATE, 'YYYY'), nextval('public.contact_reference_number_seq'));
$$;

CREATE OR REPLACE FUNCTION public.generate_support_ticket_number()
RETURNS TEXT
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT format('SP-%s-%06s', to_char(CURRENT_DATE, 'YYYY'), nextval('public.support_ticket_number_seq'));
$$;

GRANT USAGE, SELECT ON SEQUENCE public.contact_reference_number_seq TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.support_ticket_number_seq TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_contact_reference_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_support_ticket_number() TO authenticated, service_role;

ALTER TABLE public.contact_submissions
  ADD COLUMN IF NOT EXISTS reference_number TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS source_page TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS assigned_admin_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT,
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_email_error TEXT,
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_notification_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS admin_notification_error TEXT,
  ADD COLUMN IF NOT EXISTS customer_acknowledgement_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS customer_acknowledgement_error TEXT,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

UPDATE public.contact_submissions
SET status = 'open'
WHERE status = 'reviewed';

UPDATE public.contact_submissions
SET reference_number = public.generate_contact_reference_number()
WHERE reference_number IS NULL;

ALTER TABLE public.contact_submissions
  ALTER COLUMN reference_number SET DEFAULT public.generate_contact_reference_number();

ALTER TABLE public.contact_submissions
  ALTER COLUMN reference_number SET NOT NULL;

ALTER TABLE public.contact_submissions
  DROP CONSTRAINT IF EXISTS contact_submissions_status_check;

ALTER TABLE public.contact_submissions
  ADD CONSTRAINT contact_submissions_status_check
  CHECK (status IN ('new', 'open', 'in_progress', 'waiting_for_customer', 'resolved', 'closed', 'spam'));

ALTER TABLE public.contact_submissions
  DROP CONSTRAINT IF EXISTS contact_submissions_priority_check;

ALTER TABLE public.contact_submissions
  ADD CONSTRAINT contact_submissions_priority_check
  CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

CREATE UNIQUE INDEX IF NOT EXISTS contact_submissions_reference_number_unique
  ON public.contact_submissions (reference_number);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_status_created_at
  ON public.contact_submissions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_priority_created_at
  ON public.contact_submissions (priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_assigned_admin
  ON public.contact_submissions (assigned_admin_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.contact_submission_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.contact_submissions(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  actor_name TEXT,
  actor_role TEXT NOT NULL DEFAULT 'system',
  event_type TEXT NOT NULL,
  body TEXT,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT contact_submission_events_actor_role_check
    CHECK (actor_role IN ('system', 'admin'))
);

CREATE INDEX IF NOT EXISTS idx_contact_submission_events_submission_created_at
  ON public.contact_submission_events (submission_id, created_at DESC);

ALTER TABLE public.contact_submission_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_submission_events_admin_manage ON public.contact_submission_events;
CREATE POLICY contact_submission_events_admin_manage
ON public.contact_submission_events
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS contact_submission_events_service_role_manage ON public.contact_submission_events;
CREATE POLICY contact_submission_events_service_role_manage
ON public.contact_submission_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contact_submissions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contact_submission_events TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.contact_submission_guards (
  id BIGSERIAL PRIMARY KEY,
  email_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contact_submission_guards_email_ip_created_at
  ON public.contact_submission_guards (email_hash, ip_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submission_guards_duplicate_created_at
  ON public.contact_submission_guards (email_hash, content_hash, created_at DESC);

CREATE OR REPLACE FUNCTION public.check_contact_submission_guard(
  p_email_hash TEXT,
  p_ip_hash TEXT,
  p_content_hash TEXT,
  p_rate_window_seconds INTEGER DEFAULT 900,
  p_rate_limit INTEGER DEFAULT 5,
  p_duplicate_window_seconds INTEGER DEFAULT 600
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := CURRENT_TIMESTAMP;
  v_rate_window_start TIMESTAMPTZ := CURRENT_TIMESTAMP - make_interval(secs => GREATEST(COALESCE(p_rate_window_seconds, 900), 60));
  v_duplicate_window_start TIMESTAMPTZ := CURRENT_TIMESTAMP - make_interval(secs => GREATEST(COALESCE(p_duplicate_window_seconds, 600), 60));
  v_rate_count INTEGER := 0;
  v_duplicate_exists BOOLEAN := false;
BEGIN
  IF COALESCE(p_email_hash, '') = '' OR COALESCE(p_ip_hash, '') = '' OR COALESCE(p_content_hash, '') = '' THEN
    RAISE EXCEPTION 'Invalid contact submission guard input.';
  END IF;

  DELETE FROM public.contact_submission_guards
  WHERE created_at < (v_now - INTERVAL '2 days');

  SELECT COUNT(*)
  INTO v_rate_count
  FROM public.contact_submission_guards
  WHERE email_hash = p_email_hash
    AND ip_hash = p_ip_hash
    AND created_at >= v_rate_window_start;

  SELECT EXISTS (
    SELECT 1
    FROM public.contact_submission_guards
    WHERE email_hash = p_email_hash
      AND content_hash = p_content_hash
      AND created_at >= v_duplicate_window_start
  )
  INTO v_duplicate_exists;

  IF v_rate_count >= GREATEST(COALESCE(p_rate_limit, 5), 1) THEN
    RETURN jsonb_build_object(
      'rate_limited', true,
      'duplicate', v_duplicate_exists,
      'accepted', false
    );
  END IF;

  INSERT INTO public.contact_submission_guards (
    email_hash,
    ip_hash,
    content_hash
  )
  VALUES (
    p_email_hash,
    p_ip_hash,
    p_content_hash
  );

  RETURN jsonb_build_object(
    'rate_limited', false,
    'duplicate', v_duplicate_exists,
    'accepted', NOT v_duplicate_exists
  );
END;
$$;

GRANT SELECT, INSERT, DELETE ON TABLE public.contact_submission_guards TO service_role;
GRANT EXECUTE ON FUNCTION public.check_contact_submission_guard(TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER) TO service_role;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL DEFAULT public.generate_support_ticket_number(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  user_name_snapshot TEXT NOT NULL,
  user_email_snapshot TEXT NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  assigned_admin_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  related_path TEXT,
  error_code TEXT,
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  last_customer_reply_at TIMESTAMPTZ,
  last_support_reply_at TIMESTAMPTZ,
  customer_unread_count INTEGER NOT NULL DEFAULT 0,
  support_unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT support_tickets_ticket_number_unique UNIQUE (ticket_number),
  CONSTRAINT support_tickets_category_check
    CHECK (category IN (
      'account',
      'transactions',
      'financial_accounts',
      'subscriptions',
      'payments',
      'reports',
      'smart_entry_ai',
      'technical_error',
      'feature_request',
      'security',
      'other'
    )),
  CONSTRAINT support_tickets_priority_check
    CHECK (priority IN ('normal', 'high', 'urgent')),
  CONSTRAINT support_tickets_status_check
    CHECK (status IN ('open', 'assigned', 'in_progress', 'waiting_for_customer', 'waiting_for_support', 'resolved', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_created_at
  ON public.support_tickets (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_ticket_number
  ON public.support_tickets (ticket_number);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_priority_created_at
  ON public.support_tickets (status, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_admin_status
  ON public.support_tickets (assigned_admin_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  body TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT support_ticket_messages_sender_role_check
    CHECK (sender_role IN ('user', 'admin', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_created_at
  ON public.support_ticket_messages (ticket_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.support_attachment_upload_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_token TEXT NOT NULL UNIQUE,
  proposed_ticket_id UUID NOT NULL,
  ticket_owner_user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  requested_by_user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  original_file_name TEXT NOT NULL,
  extension TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'support-attachments',
  storage_path TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '2 hours'),
  uploaded_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT support_attachment_upload_intents_status_check
    CHECK (status IN ('pending', 'uploaded', 'finalized', 'linked', 'failed', 'expired', 'cancelled')),
  CONSTRAINT support_attachment_upload_intents_extension_check
    CHECK (extension IN ('png', 'jpg', 'jpeg', 'webp', 'pdf')),
  CONSTRAINT support_attachment_upload_intents_mime_type_check
    CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  CONSTRAINT support_attachment_upload_intents_file_size_check
    CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760)
);

CREATE INDEX IF NOT EXISTS idx_support_attachment_upload_intents_proposed_ticket_created_at
  ON public.support_attachment_upload_intents (proposed_ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_attachment_upload_intents_requester_status
  ON public.support_attachment_upload_intents (requested_by_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.support_ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.support_ticket_messages(id) ON DELETE CASCADE,
  upload_intent_id UUID UNIQUE REFERENCES public.support_attachment_upload_intents(id) ON DELETE SET NULL,
  uploaded_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'support-attachments',
  storage_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  extension TEXT NOT NULL,
  attachment_status TEXT NOT NULL DEFAULT 'finalized',
  linked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT support_ticket_attachments_status_check
    CHECK (attachment_status IN ('finalized', 'linked')),
  CONSTRAINT support_ticket_attachments_extension_check
    CHECK (extension IN ('png', 'jpg', 'jpeg', 'webp', 'pdf')),
  CONSTRAINT support_ticket_attachments_mime_type_check
    CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  CONSTRAINT support_ticket_attachments_file_size_check
    CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760)
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_attachments_ticket_created_at
  ON public.support_ticket_attachments (ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_ticket_attachments_message_created_at
  ON public.support_ticket_attachments (message_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.support_ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  actor_name TEXT,
  actor_role TEXT NOT NULL DEFAULT 'system',
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT support_ticket_events_actor_role_check
    CHECK (actor_role IN ('system', 'user', 'admin'))
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_events_ticket_created_at
  ON public.support_ticket_events (ticket_id, created_at DESC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_attachment_upload_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_tickets_user_read_own ON public.support_tickets;
CREATE POLICY support_tickets_user_read_own
ON public.support_tickets
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS support_tickets_admin_manage ON public.support_tickets;
CREATE POLICY support_tickets_admin_manage
ON public.support_tickets
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS support_tickets_service_role_manage ON public.support_tickets;
CREATE POLICY support_tickets_service_role_manage
ON public.support_tickets
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS support_ticket_messages_user_read_visible_own ON public.support_ticket_messages;
CREATE POLICY support_ticket_messages_user_read_visible_own
ON public.support_ticket_messages
FOR SELECT
TO authenticated
USING (
  NOT is_internal
  AND EXISTS (
    SELECT 1
    FROM public.support_tickets t
    WHERE t.id = support_ticket_messages.ticket_id
      AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS support_ticket_messages_admin_manage ON public.support_ticket_messages;
CREATE POLICY support_ticket_messages_admin_manage
ON public.support_ticket_messages
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS support_ticket_messages_service_role_manage ON public.support_ticket_messages;
CREATE POLICY support_ticket_messages_service_role_manage
ON public.support_ticket_messages
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS support_ticket_attachments_user_read_own ON public.support_ticket_attachments;
CREATE POLICY support_ticket_attachments_user_read_own
ON public.support_ticket_attachments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.support_tickets t
    WHERE t.id = support_ticket_attachments.ticket_id
      AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS support_ticket_attachments_admin_manage ON public.support_ticket_attachments;
CREATE POLICY support_ticket_attachments_admin_manage
ON public.support_ticket_attachments
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS support_ticket_attachments_service_role_manage ON public.support_ticket_attachments;
CREATE POLICY support_ticket_attachments_service_role_manage
ON public.support_ticket_attachments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS support_attachment_upload_intents_user_read_own ON public.support_attachment_upload_intents;
CREATE POLICY support_attachment_upload_intents_user_read_own
ON public.support_attachment_upload_intents
FOR SELECT
TO authenticated
USING (
  requested_by_user_id = auth.uid()
  OR (
    ticket_owner_user_id = auth.uid()
    AND requested_by_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS support_attachment_upload_intents_admin_manage ON public.support_attachment_upload_intents;
CREATE POLICY support_attachment_upload_intents_admin_manage
ON public.support_attachment_upload_intents
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS support_attachment_upload_intents_service_role_manage ON public.support_attachment_upload_intents;
CREATE POLICY support_attachment_upload_intents_service_role_manage
ON public.support_attachment_upload_intents
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS support_ticket_events_user_read_visible_own ON public.support_ticket_events;
CREATE POLICY support_ticket_events_user_read_visible_own
ON public.support_ticket_events
FOR SELECT
TO authenticated
USING (
  NOT is_internal
  AND EXISTS (
    SELECT 1
    FROM public.support_tickets t
    WHERE t.id = support_ticket_events.ticket_id
      AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS support_ticket_events_admin_manage ON public.support_ticket_events;
CREATE POLICY support_ticket_events_admin_manage
ON public.support_ticket_events
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS support_ticket_events_service_role_manage ON public.support_ticket_events;
CREATE POLICY support_ticket_events_service_role_manage
ON public.support_ticket_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

GRANT SELECT ON TABLE public.support_tickets TO authenticated;
GRANT SELECT ON TABLE public.support_ticket_messages TO authenticated;
GRANT SELECT ON TABLE public.support_attachment_upload_intents TO authenticated;
GRANT SELECT ON TABLE public.support_ticket_attachments TO authenticated;
GRANT SELECT ON TABLE public.support_ticket_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_tickets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_ticket_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_attachment_upload_intents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_ticket_attachments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_ticket_events TO service_role;

DROP TRIGGER IF EXISTS update_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS update_support_ticket_messages_updated_at ON public.support_ticket_messages;
CREATE TRIGGER update_support_ticket_messages_updated_at
  BEFORE UPDATE ON public.support_ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS update_support_attachment_upload_intents_updated_at ON public.support_attachment_upload_intents;
CREATE TRIGGER update_support_attachment_upload_intents_updated_at
  BEFORE UPDATE ON public.support_attachment_upload_intents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS update_support_ticket_attachments_updated_at ON public.support_ticket_attachments;
CREATE TRIGGER update_support_ticket_attachments_updated_at
  BEFORE UPDATE ON public.support_ticket_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.cleanup_expired_support_attachment_upload_intents(
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  intent_id UUID,
  storage_path TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH expired_rows AS (
    SELECT i.id, i.storage_path
    FROM public.support_attachment_upload_intents i
    WHERE i.status IN ('pending', 'uploaded')
      AND i.expires_at <= CURRENT_TIMESTAMP
    ORDER BY i.expires_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  ),
  updated_rows AS (
    UPDATE public.support_attachment_upload_intents i
    SET
      status = 'expired',
      failure_reason = COALESCE(i.failure_reason, 'expired'),
      updated_at = CURRENT_TIMESTAMP
    WHERE i.id IN (SELECT expired_rows.id FROM expired_rows)
    RETURNING i.id, i.storage_path
  )
  SELECT updated_rows.id, updated_rows.storage_path
  FROM updated_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_abandoned_support_attachment_upload_intents(
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  intent_id UUID,
  storage_path TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH stale_rows AS (
    SELECT i.id, i.storage_path
    FROM public.support_attachment_upload_intents i
    WHERE i.status = 'finalized'
      AND i.finalized_at IS NOT NULL
      AND i.finalized_at <= (CURRENT_TIMESTAMP - INTERVAL '6 hours')
    ORDER BY i.finalized_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  ),
  updated_rows AS (
    UPDATE public.support_attachment_upload_intents i
    SET
      status = 'cancelled',
      failure_reason = COALESCE(i.failure_reason, 'abandoned_finalized_upload'),
      updated_at = CURRENT_TIMESTAMP
    WHERE i.id IN (SELECT stale_rows.id FROM stale_rows)
    RETURNING i.id, i.storage_path
  )
  SELECT updated_rows.id, updated_rows.storage_path
  FROM updated_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_abandoned_support_ticket_attachments(
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  attachment_id UUID,
  storage_path TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH stale_rows AS (
    SELECT a.id, a.storage_path, a.upload_intent_id
    FROM public.support_ticket_attachments a
    WHERE a.message_id IS NULL
      AND a.attachment_status = 'finalized'
      AND a.created_at <= (CURRENT_TIMESTAMP - INTERVAL '6 hours')
    ORDER BY a.created_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  ),
  deleted_rows AS (
    DELETE FROM public.support_ticket_attachments a
    WHERE a.id IN (SELECT stale_rows.id FROM stale_rows)
    RETURNING a.id, a.storage_path, a.upload_intent_id
  ),
  updated_intents AS (
    UPDATE public.support_attachment_upload_intents i
    SET
      status = 'cancelled',
      failure_reason = COALESCE(i.failure_reason, 'abandoned_finalized_attachment'),
      updated_at = CURRENT_TIMESTAMP
    WHERE i.id IN (
      SELECT deleted_rows.upload_intent_id
      FROM deleted_rows
      WHERE deleted_rows.upload_intent_id IS NOT NULL
    )
    RETURNING i.id
  )
  SELECT deleted_rows.id, deleted_rows.storage_path
  FROM deleted_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_ticket_id UUID,
  p_user_id UUID,
  p_user_name_snapshot TEXT,
  p_user_email_snapshot TEXT,
  p_subject TEXT,
  p_category TEXT,
  p_priority TEXT,
  p_message_body TEXT,
  p_related_path TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_upload_intent_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS TABLE (
  ticket_id UUID,
  message_id UUID,
  ticket_number TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_id UUID;
  v_ticket_number TEXT;
  v_upload_intent_count INTEGER := COALESCE(array_length(p_upload_intent_ids, 1), 0);
  v_linked_count INTEGER := 0;
BEGIN
  IF p_ticket_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Ticket creation requires a ticket id and user id.';
  END IF;

  INSERT INTO public.support_tickets (
    id,
    user_id,
    user_name_snapshot,
    user_email_snapshot,
    subject,
    category,
    priority,
    status,
    related_path,
    error_code,
    last_customer_reply_at,
    support_unread_count,
    customer_unread_count
  )
  VALUES (
    p_ticket_id,
    p_user_id,
    p_user_name_snapshot,
    p_user_email_snapshot,
    p_subject,
    p_category,
    p_priority,
    'open',
    NULLIF(p_related_path, ''),
    NULLIF(p_error_code, ''),
    CURRENT_TIMESTAMP,
    1,
    0
  )
  RETURNING support_tickets.ticket_number
  INTO v_ticket_number;

  INSERT INTO public.support_ticket_messages (
    ticket_id,
    sender_user_id,
    sender_name,
    sender_role,
    body,
    is_internal
  )
  VALUES (
    p_ticket_id,
    p_user_id,
    p_user_name_snapshot,
    'user',
    p_message_body,
    false
  )
  RETURNING id
  INTO v_message_id;

  IF v_upload_intent_count > 0 THEN
    WITH validated_uploads AS (
      SELECT i.id,
             i.storage_bucket,
             i.storage_path,
             i.original_file_name,
             i.file_size_bytes,
             i.mime_type,
             i.extension
      FROM public.support_attachment_upload_intents i
      WHERE i.id = ANY(p_upload_intent_ids)
        AND i.proposed_ticket_id = p_ticket_id
        AND i.ticket_owner_user_id = p_user_id
        AND i.requested_by_user_id = p_user_id
        AND i.status = 'finalized'
        AND i.expires_at > CURRENT_TIMESTAMP
      FOR UPDATE
    ),
    inserted_rows AS (
      INSERT INTO public.support_ticket_attachments (
        ticket_id,
        message_id,
        upload_intent_id,
        uploaded_by_user_id,
        storage_bucket,
        storage_path,
        file_name,
        file_size_bytes,
        mime_type,
        extension,
        attachment_status,
        linked_at
      )
      SELECT
        p_ticket_id,
        v_message_id,
        v.id,
        p_user_id,
        v.storage_bucket,
        v.storage_path,
        v.original_file_name,
        v.file_size_bytes,
        v.mime_type,
        v.extension,
        'linked',
        CURRENT_TIMESTAMP
      FROM validated_uploads v
      RETURNING upload_intent_id
    )
    SELECT COUNT(*) INTO v_linked_count FROM inserted_rows;

    IF v_linked_count <> v_upload_intent_count THEN
      RAISE EXCEPTION 'One or more finalized uploads were invalid for this ticket.';
    END IF;

    UPDATE public.support_attachment_upload_intents
    SET
      status = 'linked',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ANY(p_upload_intent_ids)
      AND status = 'finalized';
  END IF;

  INSERT INTO public.support_ticket_events (
    ticket_id,
    actor_user_id,
    actor_name,
    actor_role,
    event_type,
    description,
    metadata
  )
  VALUES (
    p_ticket_id,
    p_user_id,
    p_user_name_snapshot,
    'user',
    'ticket_created',
    'Ticket created by customer.',
    jsonb_build_object(
      'ticket_number', v_ticket_number,
      'attachment_count', v_upload_intent_count
    )
  );

  RETURN QUERY
  SELECT p_ticket_id, v_message_id, v_ticket_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_support_ticket_message(
  p_ticket_id UUID,
  p_user_id UUID,
  p_sender_name TEXT,
  p_message_body TEXT,
  p_upload_intent_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS TABLE (
  message_id UUID,
  ticket_number TEXT,
  subject TEXT,
  status TEXT,
  user_name_snapshot TEXT,
  user_email_snapshot TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.support_tickets%ROWTYPE;
  v_message_id UUID;
  v_upload_intent_count INTEGER := COALESCE(array_length(p_upload_intent_ids, 1), 0);
  v_linked_count INTEGER := 0;
BEGIN
  SELECT *
  INTO v_ticket
  FROM public.support_tickets
  WHERE id = p_ticket_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Support ticket not found.';
  END IF;

  INSERT INTO public.support_ticket_messages (
    ticket_id,
    sender_user_id,
    sender_name,
    sender_role,
    body,
    is_internal
  )
  VALUES (
    p_ticket_id,
    p_user_id,
    p_sender_name,
    'user',
    p_message_body,
    false
  )
  RETURNING id
  INTO v_message_id;

  IF v_upload_intent_count > 0 THEN
    WITH validated_uploads AS (
      SELECT i.id,
             i.storage_bucket,
             i.storage_path,
             i.original_file_name,
             i.file_size_bytes,
             i.mime_type,
             i.extension
      FROM public.support_attachment_upload_intents i
      WHERE i.id = ANY(p_upload_intent_ids)
        AND i.proposed_ticket_id = p_ticket_id
        AND i.ticket_owner_user_id = p_user_id
        AND i.requested_by_user_id = p_user_id
        AND i.status = 'finalized'
        AND i.expires_at > CURRENT_TIMESTAMP
      FOR UPDATE
    ),
    inserted_rows AS (
      INSERT INTO public.support_ticket_attachments (
        ticket_id,
        message_id,
        upload_intent_id,
        uploaded_by_user_id,
        storage_bucket,
        storage_path,
        file_name,
        file_size_bytes,
        mime_type,
        extension,
        attachment_status,
        linked_at
      )
      SELECT
        p_ticket_id,
        v_message_id,
        v.id,
        p_user_id,
        v.storage_bucket,
        v.storage_path,
        v.original_file_name,
        v.file_size_bytes,
        v.mime_type,
        v.extension,
        'linked',
        CURRENT_TIMESTAMP
      FROM validated_uploads v
      RETURNING upload_intent_id
    )
    SELECT COUNT(*) INTO v_linked_count FROM inserted_rows;

    IF v_linked_count <> v_upload_intent_count THEN
      RAISE EXCEPTION 'One or more finalized uploads were invalid for this reply.';
    END IF;

    UPDATE public.support_attachment_upload_intents
    SET
      status = 'linked',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ANY(p_upload_intent_ids)
      AND status = 'finalized';
  END IF;

  UPDATE public.support_tickets
  SET
    status = 'waiting_for_support',
    resolved_at = NULL,
    closed_at = NULL,
    last_customer_reply_at = CURRENT_TIMESTAMP,
    support_unread_count = COALESCE(v_ticket.support_unread_count, 0) + 1,
    customer_unread_count = 0,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_ticket_id;

  INSERT INTO public.support_ticket_events (
    ticket_id,
    actor_user_id,
    actor_name,
    actor_role,
    event_type,
    description,
    metadata
  )
  VALUES (
    p_ticket_id,
    p_user_id,
    p_sender_name,
    'user',
    'customer_reply',
    'Customer replied to the ticket.',
    jsonb_build_object('attachment_count', v_upload_intent_count)
  );

  RETURN QUERY
  SELECT
    v_message_id,
    v_ticket.ticket_number,
    v_ticket.subject,
    'waiting_for_support'::TEXT,
    v_ticket.user_name_snapshot,
    v_ticket.user_email_snapshot;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_admin_support_ticket_message(
  p_ticket_id UUID,
  p_admin_user_id UUID,
  p_admin_name TEXT,
  p_message_body TEXT,
  p_kind TEXT,
  p_status TEXT DEFAULT NULL,
  p_upload_intent_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS TABLE (
  message_id UUID,
  ticket_number TEXT,
  subject TEXT,
  user_id UUID,
  user_name_snapshot TEXT,
  user_email_snapshot TEXT,
  status TEXT,
  first_response_recorded BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.support_tickets%ROWTYPE;
  v_message_id UUID;
  v_upload_intent_count INTEGER := COALESCE(array_length(p_upload_intent_ids, 1), 0);
  v_linked_count INTEGER := 0;
  v_is_internal BOOLEAN := p_kind = 'internal_note';
  v_next_status TEXT;
  v_first_response_recorded BOOLEAN := false;
BEGIN
  IF p_kind NOT IN ('reply', 'internal_note') THEN
    RAISE EXCEPTION 'Invalid support message kind.';
  END IF;

  SELECT *
  INTO v_ticket
  FROM public.support_tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Support ticket not found.';
  END IF;

  v_next_status := COALESCE(NULLIF(p_status, ''), CASE WHEN p_kind = 'reply' THEN 'waiting_for_customer' ELSE NULL END, v_ticket.status);

  IF v_is_internal AND v_upload_intent_count > 0 THEN
    RAISE EXCEPTION 'Internal notes cannot include attachments.';
  END IF;

  INSERT INTO public.support_ticket_messages (
    ticket_id,
    sender_user_id,
    sender_name,
    sender_role,
    body,
    is_internal
  )
  VALUES (
    p_ticket_id,
    p_admin_user_id,
    p_admin_name,
    'admin',
    p_message_body,
    v_is_internal
  )
  RETURNING id
  INTO v_message_id;

  IF v_upload_intent_count > 0 THEN
    WITH validated_uploads AS (
      SELECT i.id,
             i.storage_bucket,
             i.storage_path,
             i.original_file_name,
             i.file_size_bytes,
             i.mime_type,
             i.extension
      FROM public.support_attachment_upload_intents i
      WHERE i.id = ANY(p_upload_intent_ids)
        AND i.proposed_ticket_id = p_ticket_id
        AND i.ticket_owner_user_id = v_ticket.user_id
        AND i.requested_by_user_id = p_admin_user_id
        AND i.status = 'finalized'
        AND i.expires_at > CURRENT_TIMESTAMP
      FOR UPDATE
    ),
    inserted_rows AS (
      INSERT INTO public.support_ticket_attachments (
        ticket_id,
        message_id,
        upload_intent_id,
        uploaded_by_user_id,
        storage_bucket,
        storage_path,
        file_name,
        file_size_bytes,
        mime_type,
        extension,
        attachment_status,
        linked_at
      )
      SELECT
        p_ticket_id,
        v_message_id,
        v.id,
        p_admin_user_id,
        v.storage_bucket,
        v.storage_path,
        v.original_file_name,
        v.file_size_bytes,
        v.mime_type,
        v.extension,
        'linked',
        CURRENT_TIMESTAMP
      FROM validated_uploads v
      RETURNING upload_intent_id
    )
    SELECT COUNT(*) INTO v_linked_count FROM inserted_rows;

    IF v_linked_count <> v_upload_intent_count THEN
      RAISE EXCEPTION 'One or more finalized uploads were invalid for this admin message.';
    END IF;

    UPDATE public.support_attachment_upload_intents
    SET
      status = 'linked',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ANY(p_upload_intent_ids)
      AND status = 'finalized';
  END IF;

  IF NOT v_is_internal THEN
    v_next_status := COALESCE(NULLIF(p_status, ''), 'waiting_for_customer');
    v_first_response_recorded := v_ticket.first_response_at IS NULL;

    UPDATE public.support_tickets
    SET
      status = v_next_status,
      first_response_at = COALESCE(v_ticket.first_response_at, CURRENT_TIMESTAMP),
      last_support_reply_at = CURRENT_TIMESTAMP,
      customer_unread_count = COALESCE(v_ticket.customer_unread_count, 0) + 1,
      support_unread_count = 0,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = p_ticket_id;
  END IF;

  INSERT INTO public.support_ticket_events (
    ticket_id,
    actor_user_id,
    actor_name,
    actor_role,
    event_type,
    description,
    is_internal,
    metadata
  )
  VALUES (
    p_ticket_id,
    p_admin_user_id,
    p_admin_name,
    'admin',
    CASE WHEN v_is_internal THEN 'internal_note_added' ELSE 'admin_reply' END,
    CASE WHEN v_is_internal THEN 'Internal note added.' ELSE 'Support replied to the customer.' END,
    v_is_internal,
    jsonb_build_object(
      'attachment_count', v_upload_intent_count,
      'status_after_reply', CASE WHEN v_is_internal THEN NULL ELSE v_next_status END,
      'first_response_recorded', v_first_response_recorded
    )
  );

  IF v_first_response_recorded THEN
    INSERT INTO public.support_ticket_events (
      ticket_id,
      actor_user_id,
      actor_name,
      actor_role,
      event_type,
      description,
      metadata
    )
    VALUES (
      p_ticket_id,
      p_admin_user_id,
      p_admin_name,
      'admin',
      'first_response_recorded',
      'First support response recorded.',
      jsonb_build_object('message_id', v_message_id)
    );
  END IF;

  RETURN QUERY
  SELECT
    v_message_id,
    v_ticket.ticket_number,
    v_ticket.subject,
    v_ticket.user_id,
    v_ticket.user_name_snapshot,
    v_ticket.user_email_snapshot,
    CASE WHEN v_is_internal THEN v_ticket.status ELSE v_next_status END,
    v_first_response_recorded;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_support_ticket_metrics()
RETURNS TABLE (
  total_open BIGINT,
  unassigned BIGINT,
  urgent BIGINT,
  waiting_for_support BIGINT,
  waiting_for_customer BIGINT,
  resolved_today BIGINT,
  average_first_response_hours NUMERIC,
  average_resolution_hours NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed')) AS total_open,
    COUNT(*) FILTER (WHERE assigned_admin_id IS NULL AND status NOT IN ('resolved', 'closed')) AS unassigned,
    COUNT(*) FILTER (WHERE priority = 'urgent' AND status NOT IN ('resolved', 'closed')) AS urgent,
    COUNT(*) FILTER (WHERE status = 'waiting_for_support') AS waiting_for_support,
    COUNT(*) FILTER (WHERE status = 'waiting_for_customer') AS waiting_for_customer,
    COUNT(*) FILTER (WHERE resolved_at >= date_trunc('day', CURRENT_TIMESTAMP)) AS resolved_today,
    ROUND(AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600)::numeric, 2) AS average_first_response_hours,
    ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)::numeric, 2) AS average_resolution_hours
  FROM public.support_tickets;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_support_attachment_upload_intents(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_abandoned_support_attachment_upload_intents(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_abandoned_support_ticket_attachments(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_support_ticket_message(UUID, UUID, TEXT, TEXT, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_admin_support_ticket_message(UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_support_ticket_metrics() TO service_role;

INSERT INTO public.contact_submission_events (
  submission_id,
  actor_name,
  actor_role,
  event_type,
  body,
  metadata
)
SELECT
  cs.id,
  'System',
  'system',
  'submitted',
  'Contact enquiry received.',
  jsonb_build_object('reference_number', cs.reference_number)
FROM public.contact_submissions cs
WHERE NOT EXISTS (
  SELECT 1
  FROM public.contact_submission_events ev
  WHERE ev.submission_id = cs.id
    AND ev.event_type = 'submitted'
);

INSERT INTO public.support_ticket_events (
  ticket_id,
  actor_user_id,
  actor_name,
  actor_role,
  event_type,
  description,
  metadata
)
SELECT
  t.id,
  t.user_id,
  t.user_name_snapshot,
  'user',
  'ticket_created',
  'Ticket created.',
  jsonb_build_object('ticket_number', t.ticket_number)
FROM public.support_tickets t
WHERE NOT EXISTS (
  SELECT 1
  FROM public.support_ticket_events ev
  WHERE ev.ticket_id = t.id
    AND ev.event_type = 'ticket_created'
);

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'support-attachments',
  'support-attachments',
  false,
  10485760,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "support-attachments: owner select" ON storage.objects;
CREATE POLICY "support-attachments: owner select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'support-attachments'
    AND (
      public.is_admin()
      OR (
        array_length(storage.foldername(name), 1) = 3
        AND (storage.foldername(name))[1] = auth.uid()::text
        AND EXISTS (
          SELECT 1
          FROM public.support_tickets t
          WHERE t.id::text = (storage.foldername(name))[2]
            AND t.user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "support-attachments: owner insert" ON storage.objects;
CREATE POLICY "support-attachments: owner insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'support-attachments'
    AND (
      public.is_admin()
      OR (
        array_length(storage.foldername(name), 1) = 3
        AND (storage.foldername(name))[1] = auth.uid()::text
        AND EXISTS (
          SELECT 1
          FROM public.support_tickets t
          WHERE t.id::text = (storage.foldername(name))[2]
            AND t.user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "support-attachments: owner update" ON storage.objects;
CREATE POLICY "support-attachments: owner update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'support-attachments'
    AND (
      public.is_admin()
      OR (
        array_length(storage.foldername(name), 1) = 3
        AND (storage.foldername(name))[1] = auth.uid()::text
        AND EXISTS (
          SELECT 1
          FROM public.support_tickets t
          WHERE t.id::text = (storage.foldername(name))[2]
            AND t.user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "support-attachments: owner delete" ON storage.objects;
CREATE POLICY "support-attachments: owner delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'support-attachments'
    AND (
      public.is_admin()
      OR (
        array_length(storage.foldername(name), 1) = 3
        AND (storage.foldername(name))[1] = auth.uid()::text
        AND EXISTS (
          SELECT 1
          FROM public.support_tickets t
          WHERE t.id::text = (storage.foldername(name))[2]
            AND t.user_id = auth.uid()
        )
      )
    )
  );

INSERT INTO public.email_templates (
  template_key,
  name,
  category,
  recipient_type,
  subject,
  preheader,
  heading,
  html_body,
  text_body,
  button_text,
  button_url_template,
  enabled,
  supported_variables,
  language_code
)
VALUES
  (
    'customer_contact_enquiry_acknowledged',
    'Contact enquiry acknowledged',
    'support',
    'customer',
    'We received your enquiry {{reference_number}}',
    'Your Smart Pocket contact enquiry was received.',
    'We received your enquiry',
    '<p style="margin:0 0 16px;">Hello {{contact_name}},</p><p style="margin:0 0 16px;">Thank you for contacting Smart Pocket. We received your enquiry and our support team will review it shortly.</p><p style="margin:0 0 6px;"><strong>Reference:</strong> {{reference_number}}</p><p style="margin:0 0 6px;"><strong>Subject:</strong> {{contact_subject}}</p><p style="margin:16px 0 0;">{{contact_message}}</p>',
    'Hello {{contact_name}},\n\nThank you for contacting Smart Pocket. We received your enquiry and our support team will review it shortly.\n\nReference: {{reference_number}}\nSubject: {{contact_subject}}\n\n{{contact_message}}',
    'Visit Smart Pocket',
    '{{dashboard_url}}',
    true,
    '["contact_name","reference_number","contact_subject","contact_message","dashboard_url","support_email"]'::jsonb,
    'en'
  ),
  (
    'customer_contact_enquiry_reply',
    'Contact enquiry reply',
    'support',
    'customer',
    'Reply to your Smart Pocket enquiry {{reference_number}}',
    'A Smart Pocket support specialist replied to your enquiry.',
    'Support replied to your enquiry',
    '<p style="margin:0 0 16px;">Hello {{contact_name}},</p><p style="margin:0 0 16px;">A member of the Smart Pocket support team replied to your enquiry.</p><p style="margin:0 0 6px;"><strong>Reference:</strong> {{reference_number}}</p><p style="margin:0 0 6px;"><strong>Subject:</strong> {{contact_subject}}</p><p style="margin:16px 0 0;">{{reply_message}}</p>',
    'Hello {{contact_name}},\n\nA member of the Smart Pocket support team replied to your enquiry.\n\nReference: {{reference_number}}\nSubject: {{contact_subject}}\n\n{{reply_message}}',
    'Contact support',
    'mailto:{{support_email}}',
    true,
    '["contact_name","reference_number","contact_subject","reply_message","support_email"]'::jsonb,
    'en'
  ),
  (
    'customer_contact_enquiry_resolved',
    'Contact enquiry resolved',
    'support',
    'customer',
    'Your Smart Pocket enquiry {{reference_number}} was resolved',
    'Your contact enquiry was marked as resolved.',
    'Enquiry resolved',
    '<p style="margin:0 0 16px;">Hello {{contact_name}},</p><p style="margin:0 0 16px;">Your enquiry has been marked as resolved. If you still need help, simply reply to this email or submit a new enquiry.</p><p style="margin:0 0 6px;"><strong>Reference:</strong> {{reference_number}}</p><p style="margin:0 0 6px;"><strong>Subject:</strong> {{contact_subject}}</p>',
    'Hello {{contact_name}},\n\nYour enquiry has been marked as resolved. If you still need help, simply reply to this email or submit a new enquiry.\n\nReference: {{reference_number}}\nSubject: {{contact_subject}}',
    'Visit Smart Pocket',
    '{{dashboard_url}}',
    true,
    '["contact_name","reference_number","contact_subject","dashboard_url","support_email"]'::jsonb,
    'en'
  ),
  (
    'customer_support_ticket_created',
    'Support ticket created',
    'support',
    'customer',
    'Support ticket created: {{ticket_number}}',
    'Your Smart Pocket support ticket is now open.',
    'Support ticket created',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your Smart Pocket support ticket has been created and our team will review it as soon as possible.</p><p style="margin:0 0 6px;"><strong>Ticket:</strong> {{ticket_number}}</p><p style="margin:0 0 6px;"><strong>Subject:</strong> {{ticket_subject}}</p><p style="margin:16px 0 0;">{{message_body}}</p>',
    'Hello {{customer_name}},\n\nYour Smart Pocket support ticket has been created and our team will review it as soon as possible.\n\nTicket: {{ticket_number}}\nSubject: {{ticket_subject}}\n\n{{message_body}}',
    'Open ticket',
    '{{ticket_url}}',
    true,
    '["customer_name","ticket_number","ticket_subject","message_body","ticket_url","support_email"]'::jsonb,
    'en'
  ),
  (
    'admin_support_ticket_created',
    'Support ticket created (admin notification)',
    'admin',
    'admin',
    'New support ticket: {{ticket_number}}',
    'A new Smart Pocket support ticket was created.',
    'New support ticket',
    '<p style="margin:0 0 16px;">A new support ticket was created.</p><p style="margin:0 0 6px;"><strong>Ticket:</strong> {{ticket_number}}</p><p style="margin:0 0 6px;"><strong>User:</strong> {{customer_name}} ({{customer_email}})</p><p style="margin:0 0 6px;"><strong>Priority:</strong> {{ticket_priority}}</p><p style="margin:0 0 6px;"><strong>Subject:</strong> {{ticket_subject}}</p><p style="margin:16px 0 0;">{{message_body}}</p>',
    'A new support ticket was created.\n\nTicket: {{ticket_number}}\nUser: {{customer_name}} ({{customer_email}})\nPriority: {{ticket_priority}}\nSubject: {{ticket_subject}}\n\n{{message_body}}',
    'Open admin ticket',
    '{{admin_ticket_url}}',
    true,
    '["ticket_number","customer_name","customer_email","ticket_priority","ticket_subject","message_body","admin_ticket_url"]'::jsonb,
    'en'
  ),
  (
    'customer_support_ticket_admin_reply',
    'Support ticket admin reply',
    'support',
    'customer',
    'New reply on ticket {{ticket_number}}',
    'A Smart Pocket support specialist replied.',
    'New support reply',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">A member of the Smart Pocket support team replied to your ticket.</p><p style="margin:0 0 6px;"><strong>Ticket:</strong> {{ticket_number}}</p><p style="margin:0 0 6px;"><strong>Subject:</strong> {{ticket_subject}}</p><p style="margin:16px 0 0;">{{reply_message}}</p>',
    'Hello {{customer_name}},\n\nA member of the Smart Pocket support team replied to your ticket.\n\nTicket: {{ticket_number}}\nSubject: {{ticket_subject}}\n\n{{reply_message}}',
    'Open ticket',
    '{{ticket_url}}',
    true,
    '["customer_name","ticket_number","ticket_subject","reply_message","ticket_url"]'::jsonb,
    'en'
  ),
  (
    'admin_support_ticket_customer_reply',
    'Support ticket customer reply (admin notification)',
    'admin',
    'admin',
    'Customer replied on ticket {{ticket_number}}',
    'A customer replied to a Smart Pocket support ticket.',
    'Customer replied',
    '<p style="margin:0 0 16px;">A customer replied to a support ticket.</p><p style="margin:0 0 6px;"><strong>Ticket:</strong> {{ticket_number}}</p><p style="margin:0 0 6px;"><strong>User:</strong> {{customer_name}} ({{customer_email}})</p><p style="margin:0 0 6px;"><strong>Subject:</strong> {{ticket_subject}}</p><p style="margin:16px 0 0;">{{reply_message}}</p>',
    'A customer replied to a support ticket.\n\nTicket: {{ticket_number}}\nUser: {{customer_name}} ({{customer_email}})\nSubject: {{ticket_subject}}\n\n{{reply_message}}',
    'Open admin ticket',
    '{{admin_ticket_url}}',
    true,
    '["ticket_number","customer_name","customer_email","ticket_subject","reply_message","admin_ticket_url"]'::jsonb,
    'en'
  ),
  (
    'customer_support_ticket_status_changed',
    'Support ticket status changed',
    'support',
    'customer',
    'Ticket {{ticket_number}} status updated',
    'Your support ticket status changed.',
    'Ticket status updated',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your ticket status changed to <strong>{{ticket_status}}</strong>.</p><p style="margin:0 0 6px;"><strong>Ticket:</strong> {{ticket_number}}</p><p style="margin:0 0 6px;"><strong>Subject:</strong> {{ticket_subject}}</p>',
    'Hello {{customer_name}},\n\nYour ticket status changed to {{ticket_status}}.\n\nTicket: {{ticket_number}}\nSubject: {{ticket_subject}}',
    'Open ticket',
    '{{ticket_url}}',
    true,
    '["customer_name","ticket_number","ticket_status","ticket_subject","ticket_url"]'::jsonb,
    'en'
  ),
  (
    'customer_support_ticket_resolved',
    'Support ticket resolved',
    'support',
    'customer',
    'Ticket {{ticket_number}} resolved',
    'Your Smart Pocket support ticket was resolved.',
    'Ticket resolved',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your support ticket has been resolved. If you still need help, you can reopen the ticket from your support centre.</p><p style="margin:0 0 6px;"><strong>Ticket:</strong> {{ticket_number}}</p><p style="margin:0 0 6px;"><strong>Subject:</strong> {{ticket_subject}}</p>',
    'Hello {{customer_name}},\n\nYour support ticket has been resolved. If you still need help, you can reopen the ticket from your support centre.\n\nTicket: {{ticket_number}}\nSubject: {{ticket_subject}}',
    'Open ticket',
    '{{ticket_url}}',
    true,
    '["customer_name","ticket_number","ticket_subject","ticket_url"]'::jsonb,
    'en'
  ),
  (
    'customer_support_ticket_reopened',
    'Support ticket reopened',
    'support',
    'customer',
    'Ticket {{ticket_number}} reopened',
    'Your Smart Pocket support ticket was reopened.',
    'Ticket reopened',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your support ticket has been reopened and is now back with our support team.</p><p style="margin:0 0 6px;"><strong>Ticket:</strong> {{ticket_number}}</p><p style="margin:0 0 6px;"><strong>Subject:</strong> {{ticket_subject}}</p>',
    'Hello {{customer_name}},\n\nYour support ticket has been reopened and is now back with our support team.\n\nTicket: {{ticket_number}}\nSubject: {{ticket_subject}}',
    'Open ticket',
    '{{ticket_url}}',
    true,
    '["customer_name","ticket_number","ticket_subject","ticket_url"]'::jsonb,
    'en'
  )
ON CONFLICT (template_key, language_code) DO NOTHING;
