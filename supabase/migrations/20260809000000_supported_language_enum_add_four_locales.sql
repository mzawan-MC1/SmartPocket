-- ============================================================
--  Expand public.supported_language enum from 4 to 8 values.
--  Targets user_profiles.preferred_language and
--  cms_translations.language columns, both of which reference
--  this shared enum type.
--
--  Uses safe DO + IF NOT EXISTS pattern because
--  ALTER TYPE ADD VALUE cannot be wrapped in a transaction
--  block and must not error if values already exist.
-- ============================================================

DO $$
DECLARE
  _enum_name text := 'supported_language';
  _values_to_add text[] := ARRAY['tr', 'zh-CN', 'es', 'pt-BR'];
  _existing_values text[];
  _value text;
BEGIN
  SELECT ARRAY_AGG(enumlabel ORDER BY enumsortorder)
    INTO _existing_values
    FROM pg_catalog.pg_enum
   WHERE enumtypid = (
     SELECT oid FROM pg_catalog.pg_type
      WHERE typname = _enum_name
        AND typnamespace = (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = 'public')
   );

  IF _existing_values IS NULL THEN
    RAISE NOTICE 'public.supported_language enum not found; skipping enum update.';
    RETURN;
  END IF;

  FOREACH _value IN ARRAY _values_to_add LOOP
    IF _value = ANY(_existing_values) THEN
      RAISE NOTICE 'Value % already exists in public.supported_language; skipping.', _value;
    ELSE
      EXECUTE format(
        'ALTER TYPE public.%I ADD VALUE IF NOT EXISTS %L',
        _enum_name,
        _value
      );
      RAISE NOTICE 'Added % to public.supported_language enum.', _value;
    END IF;
  END LOOP;
END $$;
