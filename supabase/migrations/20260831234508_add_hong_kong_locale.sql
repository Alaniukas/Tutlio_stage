-- Allow Hong Kong Traditional Chinese preferences for tutors and tutoring businesses.
-- Extend existing checks so locales added by parallel work remain accepted.
-- No currency, payment, authorization or RLS changes.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  target_table text;
  check_name text;
  existing_condition text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['profiles', 'organizations'] LOOP
    check_name := target_table || '_preferred_locale_check';
    SELECT pg_get_expr(c.conbin, c.conrelid)
      INTO existing_condition
      FROM pg_constraint AS c
      JOIN pg_class AS t ON t.oid = c.conrelid
      JOIN pg_namespace AS n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = target_table
        AND c.conname = check_name AND c.contype = 'c';
    IF existing_condition IS NULL THEN
      RAISE EXCEPTION 'Expected preferred_locale check is missing on public.%', target_table;
    END IF;
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', target_table, check_name);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK ((%s) OR preferred_locale = %L)',
      target_table, check_name, existing_condition, 'zh-hk'
    );
  END LOOP;
END;
$migration$;

COMMIT;
