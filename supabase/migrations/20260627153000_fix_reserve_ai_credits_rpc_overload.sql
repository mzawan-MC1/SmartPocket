BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.reserve_ai_credits(uuid,text,text,integer)') IS NULL THEN
    RAISE EXCEPTION 'Expected canonical function public.reserve_ai_credits(uuid, text, text, integer) to exist before overload cleanup.';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.reserve_ai_credits(UUID, TEXT, TEXT);

REVOKE ALL ON FUNCTION public.reserve_ai_credits(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_ai_credits(UUID, TEXT, TEXT, INTEGER) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
