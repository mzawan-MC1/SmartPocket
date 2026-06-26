-- Split the legacy "Food & Dining" system expense category into:
--   1. "Groceries & Household"
--   2. "Dining Out"
--
-- Safety goals:
-- - preserve the existing category UUID for legacy "Food & Dining" rows by renaming in place
-- - if both legacy and new system rows exist, preserve the legacy UUID as canonical
-- - move all category foreign-key references from duplicate "Dining Out" rows to the canonical UUID
-- - keep existing transactions/budgets/recurring/subscription/item rows attached
-- - add the new groceries category idempotently for all users through the shared system catalog
-- - normalize sort_order so selectors show the requested default order

BEGIN;

DO $$
DECLARE
  v_legacy_food_id UUID;
  v_existing_dining_id UUID;
  v_legacy_food_count INTEGER;
  v_existing_dining_count INTEGER;
  v_reference RECORD;
BEGIN
  IF to_regprocedure('gen_random_uuid()') IS NULL
     AND to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL THEN
    RAISE EXCEPTION 'gen_random_uuid() is required for 20260625223000_split_food_dining_default_categories.sql';
  END IF;

  SELECT COUNT(*)
  INTO v_legacy_food_count
  FROM public.categories
  WHERE user_id IS NULL
    AND is_system = TRUE
    AND category_type = 'expense'
    AND name = 'Food & Dining';

  SELECT COUNT(*)
  INTO v_existing_dining_count
  FROM public.categories
  WHERE user_id IS NULL
    AND is_system = TRUE
    AND category_type = 'expense'
    AND name = 'Dining Out';

  IF v_legacy_food_count > 1 OR v_existing_dining_count > 1 THEN
    RAISE EXCEPTION
      'Expected at most one global system expense category for each of "Food & Dining" and "Dining Out", found % and %',
      v_legacy_food_count,
      v_existing_dining_count;
  END IF;

  SELECT id
  INTO v_legacy_food_id
  FROM public.categories
  WHERE user_id IS NULL
    AND is_system = TRUE
    AND category_type = 'expense'
    AND name = 'Food & Dining'
  LIMIT 1
  FOR UPDATE;

  SELECT id
  INTO v_existing_dining_id
  FROM public.categories
  WHERE user_id IS NULL
    AND is_system = TRUE
    AND category_type = 'expense'
    AND name = 'Dining Out'
  LIMIT 1
  FOR UPDATE;

  IF v_legacy_food_id IS NOT NULL AND v_existing_dining_id IS NOT NULL THEN
    FOR v_reference IN
      SELECT
        source_ns.nspname AS schema_name,
        source_table.relname AS table_name,
        source_column.attname AS column_name
      FROM pg_constraint constraint_def
      JOIN pg_class source_table
        ON source_table.oid = constraint_def.conrelid
      JOIN pg_namespace source_ns
        ON source_ns.oid = source_table.relnamespace
      JOIN pg_class target_table
        ON target_table.oid = constraint_def.confrelid
      JOIN pg_namespace target_ns
        ON target_ns.oid = target_table.relnamespace
      JOIN unnest(constraint_def.conkey) WITH ORDINALITY AS source_key(attnum, ordinality)
        ON TRUE
      JOIN unnest(constraint_def.confkey) WITH ORDINALITY AS target_key(attnum, ordinality)
        ON target_key.ordinality = source_key.ordinality
      JOIN pg_attribute source_column
        ON source_column.attrelid = constraint_def.conrelid
       AND source_column.attnum = source_key.attnum
      JOIN pg_attribute target_column
        ON target_column.attrelid = constraint_def.confrelid
       AND target_column.attnum = target_key.attnum
      WHERE constraint_def.contype = 'f'
        AND target_ns.nspname = 'public'
        AND target_table.relname = 'categories'
        AND target_column.attname = 'id'
        AND array_length(constraint_def.conkey, 1) = 1
        AND array_length(constraint_def.confkey, 1) = 1
    LOOP
      EXECUTE format(
        'UPDATE %I.%I SET %I = $1 WHERE %I = $2',
        v_reference.schema_name,
        v_reference.table_name,
        v_reference.column_name,
        v_reference.column_name
      )
      USING v_legacy_food_id, v_existing_dining_id;
    END LOOP;

    DELETE FROM public.categories
    WHERE id = v_existing_dining_id;

    UPDATE public.categories
    SET
      name = 'Dining Out',
      icon = CASE
        WHEN COALESCE(icon, '') = '' THEN 'UtensilsCrossed'
        ELSE icon
      END
    WHERE id = v_legacy_food_id;
  ELSIF v_legacy_food_id IS NOT NULL THEN
    UPDATE public.categories
    SET
      name = 'Dining Out',
      icon = CASE
        WHEN COALESCE(icon, '') = '' THEN 'UtensilsCrossed'
        ELSE icon
      END
    WHERE id = v_legacy_food_id;
  ELSIF v_existing_dining_id IS NULL THEN
    INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order)
    VALUES (gen_random_uuid(), NULL, 'Dining Out', 'expense', '#f97316', 'UtensilsCrossed', TRUE, 11);
  END IF;

  INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order)
  SELECT gen_random_uuid(), NULL, 'Groceries & Household', 'expense', '#65a30d', 'ShoppingCart', TRUE, 10
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.categories existing
    WHERE existing.user_id IS NULL
      AND existing.is_system = TRUE
      AND existing.category_type = 'expense'
      AND existing.name = 'Groceries & Household'
  );

  UPDATE public.categories AS category_row
  SET sort_order = desired.sort_order
  FROM (
    VALUES
      ('Groceries & Household', 10),
      ('Dining Out', 11),
      ('Housing', 12),
      ('Transport', 13),
      ('Utilities', 14),
      ('Shopping', 15),
      ('Healthcare', 16),
      ('Entertainment', 17),
      ('Travel', 18),
      ('Education', 19),
      ('Personal Care', 20),
      ('Subscriptions', 21),
      ('Savings', 22),
      ('Other Expense', 23),
      ('Other', 24)
  ) AS desired(name, sort_order)
  WHERE category_row.user_id IS NULL
    AND category_row.is_system = TRUE
    AND category_row.category_type = 'expense'
    AND category_row.name = desired.name;
END $$;

COMMIT;
