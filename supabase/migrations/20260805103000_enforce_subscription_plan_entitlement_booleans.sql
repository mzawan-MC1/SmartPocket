-- Enforce authoritative plan entitlement booleans on subscription_plans rows.
--
-- The original seed in 20260616050000_subscription_ai_credits.sql defines:
--   * Personal: ai_history=true, managed_people=false, shared_spaces=false,
--               standard_reports=true, family_reports=false
--   * Family:   ai_history=true, managed_people=true,  shared_spaces=true,
--               standard_reports=true, family_reports=true
--   * Free/Trial follows seed values.
--
-- The normalize_subscription_plan_row trigger only normalizes PRICING fields
-- (price_amount, yearly_discount_percent, billing_interval).  It never resets
-- entitlement booleans, so admin edits or data drift can leave rows in an
-- inconsistent state (e.g. Personal with managed_people_enabled=true).  When
-- that happens the UI recommendation sort sees both plans qualify and picks
-- Personal by displayOrder instead of the true minimum tier.
--
-- This migration is a one-time re-sync of entitlement booleans to the
-- canonical seed values.  It does not touch pricing, ordering, or any other
-- column.  Yearly variants of Personal/Family intentionally inherit the same
-- entitlement values as their monthly counterparts (the sync function in the
-- yearly migration copies them).

UPDATE public.subscription_plans
SET
  ai_history_enabled       = CASE plan_code
                               WHEN 'free_trial' THEN false
                               WHEN 'personal'   THEN true
                               WHEN 'family'     THEN true
                               ELSE ai_history_enabled
                             END,
  managed_people_enabled   = CASE plan_code
                               WHEN 'free_trial' THEN false
                               WHEN 'personal'   THEN false
                               WHEN 'family'     THEN true
                               ELSE managed_people_enabled
                             END,
  shared_spaces_enabled    = CASE plan_code
                               WHEN 'free_trial' THEN false
                               WHEN 'personal'   THEN false
                               WHEN 'family'     THEN true
                               ELSE shared_spaces_enabled
                             END,
  standard_reports_enabled = CASE plan_code
                               WHEN 'free_trial' THEN true
                               WHEN 'personal'   THEN true
                               WHEN 'family'     THEN true
                               ELSE standard_reports_enabled
                             END,
  family_reports_enabled   = CASE plan_code
                               WHEN 'free_trial' THEN false
                               WHEN 'personal'   THEN false
                               WHEN 'family'     THEN true
                               ELSE family_reports_enabled
                             END,
  updated_at               = now()
WHERE plan_code IN ('free_trial', 'personal', 'family');
