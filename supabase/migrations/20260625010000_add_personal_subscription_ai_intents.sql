-- ============================================================
-- Add Personal Subscription Smart Entry intents to AI enums
-- Safe additive migration only
-- ============================================================

ALTER TYPE public.ai_overall_intent
  ADD VALUE IF NOT EXISTS 'personal_subscription_create';

ALTER TYPE public.ai_overall_intent
  ADD VALUE IF NOT EXISTS 'personal_subscription_update';

ALTER TYPE public.ai_overall_intent
  ADD VALUE IF NOT EXISTS 'personal_subscription_payment';

ALTER TYPE public.ai_overall_intent
  ADD VALUE IF NOT EXISTS 'personal_subscription_cancel';
