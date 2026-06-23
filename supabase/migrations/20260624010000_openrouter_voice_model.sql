-- ============================================================
-- OpenRouter voice model alignment
-- Additive, idempotent migration for OpenRouter-backed Voice AI
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_settings'
      AND column_name = 'voice_model'
  ) THEN
    ALTER TABLE public.ai_settings
      ADD COLUMN voice_model TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'ai_provider_name'
      AND e.enumlabel = 'openrouter_voice'
  ) THEN
    ALTER TYPE public.ai_provider_name
      ADD VALUE 'openrouter_voice';
  END IF;
END $$;

INSERT INTO public.ai_provider_health (provider, status)
VALUES ('openrouter_voice', 'not_configured')
ON CONFLICT (provider) DO NOTHING;
