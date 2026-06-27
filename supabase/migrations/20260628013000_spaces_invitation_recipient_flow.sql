BEGIN;

ALTER TABLE public.space_invitations
  ADD COLUMN IF NOT EXISTS invited_user_id UUID NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL;

UPDATE public.space_invitations AS si
SET invited_user_id = up.id
FROM public.user_profiles AS up
WHERE si.invited_user_id IS NULL
  AND up.email IS NOT NULL
  AND lower(btrim(si.email)) = lower(btrim(up.email));

CREATE INDEX IF NOT EXISTS idx_space_invitations_invited_user_id
  ON public.space_invitations (invited_user_id)
  WHERE invited_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_space_invitations_email_status
  ON public.space_invitations (lower(email), status);

DROP POLICY IF EXISTS "spaces_require_feature" ON public.spaces;
CREATE POLICY "spaces_require_feature_select"
  ON public.spaces
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user()
    OR public.subscription_feature_enabled_for_current_user('shared_spaces')
    OR public.is_space_member(id)
  );

CREATE POLICY "spaces_require_feature_insert"
  ON public.spaces
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_user()
    OR public.subscription_feature_enabled_for_current_user('shared_spaces')
  );

CREATE POLICY "spaces_require_feature_update"
  ON public.spaces
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_user()
    OR public.subscription_feature_enabled_for_current_user('shared_spaces')
  )
  WITH CHECK (
    public.is_admin_user()
    OR public.subscription_feature_enabled_for_current_user('shared_spaces')
  );

CREATE POLICY "spaces_require_feature_delete"
  ON public.spaces
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_user()
    OR public.subscription_feature_enabled_for_current_user('shared_spaces')
  );

DROP POLICY IF EXISTS "space_members_require_feature" ON public.space_members;
CREATE POLICY "space_members_require_feature_select"
  ON public.space_members
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user()
    OR public.subscription_feature_enabled_for_current_user('shared_spaces')
    OR user_id = auth.uid()
  );

CREATE POLICY "space_members_require_feature_insert"
  ON public.space_members
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_user()
    OR public.subscription_feature_enabled_for_current_user('shared_spaces')
  );

CREATE POLICY "space_members_require_feature_update"
  ON public.space_members
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_user()
    OR public.subscription_feature_enabled_for_current_user('shared_spaces')
  )
  WITH CHECK (
    public.is_admin_user()
    OR public.subscription_feature_enabled_for_current_user('shared_spaces')
  );

CREATE POLICY "space_members_require_feature_delete"
  ON public.space_members
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_user()
    OR public.subscription_feature_enabled_for_current_user('shared_spaces')
  );

DROP POLICY IF EXISTS "space_invitations_require_feature" ON public.space_invitations;
CREATE POLICY "space_invitations_require_feature_select"
  ON public.space_invitations
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user()
    OR public.subscription_feature_enabled_for_current_user('shared_spaces')
    OR invited_user_id = auth.uid()
    OR lower(email) = lower(auth.jwt() ->> 'email')
  );

CREATE POLICY "space_invitations_require_feature_insert"
  ON public.space_invitations
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_user()
    OR public.subscription_feature_enabled_for_current_user('shared_spaces')
  );

CREATE POLICY "space_invitations_require_feature_update"
  ON public.space_invitations
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_user()
    OR public.subscription_feature_enabled_for_current_user('shared_spaces')
  )
  WITH CHECK (
    public.is_admin_user()
    OR public.subscription_feature_enabled_for_current_user('shared_spaces')
  );

CREATE POLICY "space_invitations_require_feature_delete"
  ON public.space_invitations
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_user()
    OR public.subscription_feature_enabled_for_current_user('shared_spaces')
  );

CREATE OR REPLACE FUNCTION public.rpc_respond_to_space_invitation(
  p_invitation_id UUID DEFAULT NULL,
  p_token TEXT DEFAULT NULL,
  p_response TEXT DEFAULT NULL
)
RETURNS TABLE (
  invitation_id UUID,
  space_id UUID,
  status TEXT,
  membership_created BOOLEAN,
  already_member BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $func$
DECLARE
  v_user_id UUID := auth.uid();
  v_jwt_email TEXT := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_invitation public.space_invitations%ROWTYPE;
  v_space public.spaces%ROWTYPE;
  v_existing_member BOOLEAN := false;
  v_membership_created BOOLEAN := false;
  v_inserted_count INTEGER := 0;
  v_source_key TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_response NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'INVALID_RESPONSE';
  END IF;

  IF p_invitation_id IS NULL AND coalesce(nullif(btrim(p_token), ''), '') = '' THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND';
  END IF;

  SELECT *
  INTO v_invitation
  FROM public.space_invitations
  WHERE (p_invitation_id IS NOT NULL AND id = p_invitation_id)
     OR (coalesce(nullif(btrim(p_token), ''), '') <> '' AND token = btrim(p_token))
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND';
  END IF;

  IF v_jwt_email = '' OR lower(v_invitation.email) <> v_jwt_email THEN
    RAISE EXCEPTION 'INVITATION_EMAIL_MISMATCH';
  END IF;

  IF v_invitation.invited_user_id IS NOT NULL AND v_invitation.invited_user_id <> v_user_id THEN
    RAISE EXCEPTION 'INVITATION_EMAIL_MISMATCH';
  END IF;

  IF v_invitation.status = 'revoked' THEN
    RAISE EXCEPTION 'INVITATION_REVOKED';
  END IF;

  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'INVITATION_ALREADY_RESPONDED';
  END IF;

  IF v_invitation.expires_at IS NOT NULL AND v_invitation.expires_at <= now() THEN
    UPDATE public.notifications
    SET
      is_read = true,
      read_at = now(),
      action_url = NULL,
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('invitation_status', 'expired', 'actionable', false)
    WHERE source_key = concat('space_invitation:', v_invitation.id);

    RAISE EXCEPTION 'INVITATION_EXPIRED';
  END IF;

  SELECT *
  INTO v_space
  FROM public.spaces
  WHERE id = v_invitation.space_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SPACE_NOT_FOUND';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.space_members
    WHERE space_id = v_invitation.space_id
      AND user_id = v_user_id
  )
  INTO v_existing_member;

  IF p_response = 'accepted' AND NOT v_existing_member THEN
    INSERT INTO public.space_members (
      space_id,
      user_id,
      role
    )
    VALUES (
      v_invitation.space_id,
      v_user_id,
      v_invitation.role
    )
    ON CONFLICT (space_id, user_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    v_membership_created := v_inserted_count > 0;
  END IF;

  UPDATE public.space_invitations
  SET
    status = p_response::public.invitation_status,
    responded_at = coalesce(responded_at, now()),
    updated_at = now(),
    invited_user_id = coalesce(invited_user_id, v_user_id)
  WHERE id = v_invitation.id;

  v_source_key := concat('space_invitation:', v_invitation.id);

  UPDATE public.notifications
  SET
    is_read = true,
    read_at = now(),
    action_url = NULL,
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('invitation_status', p_response, 'actionable', false)
  WHERE source_key = v_source_key;

  INSERT INTO public.activity_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    previous_value,
    new_value
  )
  VALUES (
    v_user_id,
    concat('invitation_', p_response),
    'space_invitations',
    v_invitation.id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object(
      'status', p_response,
      'space_id', v_invitation.space_id,
      'role', v_invitation.role,
      'already_member', v_existing_member
    )
  );

  invitation_id := v_invitation.id;
  space_id := v_invitation.space_id;
  status := p_response;
  membership_created := v_membership_created;
  already_member := v_existing_member;
  RETURN NEXT;
END;
$func$;

REVOKE ALL ON FUNCTION public.rpc_respond_to_space_invitation(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_respond_to_space_invitation(UUID, TEXT, TEXT) TO authenticated;

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
VALUES (
  'space_invitation',
  'Space invitation',
  'spaces',
  'customer',
  '{{inviter_name}} invited you to join {{space_name}}',
  'Review your Smart Pocket space invitation before it expires.',
  'You are invited to join {{space_name}}',
  '<p style="margin:0 0 16px;">Hello {{recipient_name}},</p><p style="margin:0 0 16px;">{{inviter_name}} invited you to join <strong>{{space_name}}</strong> in Smart Pocket as <strong>{{role}}</strong>.</p><p style="margin:0 0 16px;">This invitation expires on {{expires_at}}.</p><p style="margin:0 0 16px;">Sign in or create your account using <strong>{{recipient_email}}</strong>, then review the invitation before accepting or declining it.</p><p style="margin:0 0 16px;">If the button does not work, copy and paste this link into your browser:</p><p style="margin:0 0 16px;"><a href="{{invitation_url}}">{{invitation_url}}</a></p><p style="margin:0;">If you did not expect this invitation, you can ignore this email or contact {{support_email}}.</p>',
  'Hello {{recipient_name}},\n\n{{inviter_name}} invited you to join "{{space_name}}" in Smart Pocket as {{role}}.\n\nThis invitation expires on {{expires_at}}.\n\nSign in or create your account using {{recipient_email}}, then review the invitation before accepting or declining it.\n\nInvitation link: {{invitation_url}}\n\nIf you did not expect this invitation, you can ignore this email or contact {{support_email}}.',
  'Review invitation',
  '{{invitation_url}}',
  true,
  '["recipient_name","recipient_email","inviter_name","space_name","role","invitation_url","expires_at","platform_name","support_email"]'::jsonb,
  'en'
)
ON CONFLICT (template_key, language_code) DO UPDATE
SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  recipient_type = EXCLUDED.recipient_type,
  subject = EXCLUDED.subject,
  preheader = EXCLUDED.preheader,
  heading = EXCLUDED.heading,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  button_text = EXCLUDED.button_text,
  button_url_template = EXCLUDED.button_url_template,
  enabled = EXCLUDED.enabled,
  supported_variables = EXCLUDED.supported_variables,
  updated_at = now();

COMMIT;
