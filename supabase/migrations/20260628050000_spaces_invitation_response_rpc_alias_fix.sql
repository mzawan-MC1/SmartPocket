BEGIN;

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
  v_existing_member BOOLEAN := false;
  v_membership_created BOOLEAN := false;
  v_inserted_count INTEGER := 0;
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

  SELECT si.*
  INTO v_invitation
  FROM public.space_invitations AS si
  WHERE (p_invitation_id IS NOT NULL AND si.id = p_invitation_id)
     OR (
       coalesce(nullif(btrim(p_token), ''), '') <> ''
       AND si.token = btrim(p_token)
     )
  ORDER BY si.created_at DESC
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
    UPDATE public.notifications AS n
    SET
      is_read = true,
      read_at = now(),
      action_url = NULL,
      metadata = coalesce(n.metadata, '{}'::jsonb)
        || jsonb_build_object('invitation_status', 'expired', 'actionable', false)
    WHERE n.source_key = concat('space_invitation:', v_invitation.id);

    RAISE EXCEPTION 'INVITATION_EXPIRED';
  END IF;

  PERFORM 1
  FROM public.spaces AS s
  WHERE s.id = v_invitation.space_id
    AND s.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SPACE_NOT_FOUND';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.space_members AS sm
    WHERE sm.space_id = v_invitation.space_id
      AND sm.user_id = v_user_id
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

  UPDATE public.space_invitations AS si
  SET
    status = p_response::public.invitation_status,
    responded_at = coalesce(si.responded_at, now()),
    updated_at = now(),
    invited_user_id = coalesce(si.invited_user_id, v_user_id)
  WHERE si.id = v_invitation.id;

  UPDATE public.notifications AS n
  SET
    is_read = true,
    read_at = now(),
    action_url = NULL,
    metadata = coalesce(n.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'invitation_status', p_response,
        'actionable', false
      )
  WHERE n.source_key = concat('space_invitation:', v_invitation.id);

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

  RETURN QUERY
  SELECT
    v_invitation.id,
    v_invitation.space_id,
    p_response,
    v_membership_created,
    v_existing_member;
END;
$func$;

REVOKE ALL ON FUNCTION public.rpc_respond_to_space_invitation(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_respond_to_space_invitation(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_respond_to_space_invitation(UUID, TEXT, TEXT) TO authenticated;

COMMIT;
