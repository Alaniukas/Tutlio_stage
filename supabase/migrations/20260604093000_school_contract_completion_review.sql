-- School contract "data supplemented -> admin confirms & sends" review flow.
-- Adds a flag so the admin can be notified (email + dashboard) when a parent
-- supplements contract data, instead of auto-sending a new contract.
-- Also sets the seeded school org's display name to the legal entity name so it
-- appears in school contract/payment emails everywhere.

DO $$
BEGIN
  IF to_regclass('public.school_contracts') IS NULL THEN
    RAISE NOTICE 'Skipping migration: public.school_contracts does not exist in this database.';
    RETURN;
  END IF;

  ALTER TABLE public.school_contracts
    ADD COLUMN IF NOT EXISTS completion_submitted_at timestamptz;
END $$;

-- Display the legal entity name for the "Laisvi vaikai" school (school-only scope).
UPDATE public.organizations
SET name = 'VšĮ „Laisvi vaikai“'
WHERE id = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17'
  AND entity_type = 'school';
