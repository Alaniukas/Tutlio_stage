-- Restore the intended foreign keys on public.school_contracts.
-- 20260420000001_unify_schools_into_orgs.sql defined organization_id and
-- template_id FKs inside a CREATE TABLE IF NOT EXISTS. Where the table already
-- existed, that block was a no-op, so only school_contracts_student_id_fkey was
-- ever created. Without the organization_id / template_id FKs, PostgREST cannot
-- resolve the embeds used by the contract-completion endpoints
-- (template:school_contract_templates(...), organizations(...)) and the whole
-- .select() fails — surfacing to parents as "Sutartis nerasta".

DO $$
BEGIN
  IF to_regclass('public.school_contracts') IS NULL THEN
    RAISE NOTICE 'Skipping migration: public.school_contracts does not exist in this database.';
    RETURN;
  END IF;

  -- organization_id -> organizations.id (ON DELETE CASCADE), per intended schema.
  IF to_regclass('public.organizations') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.school_contracts'::regclass
         AND contype = 'f'
         AND conname IN ('school_contracts_organization_id_fkey', 'fk_sc_organization')
     ) THEN
    ALTER TABLE public.school_contracts
      ADD CONSTRAINT school_contracts_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- template_id -> school_contract_templates.id (ON DELETE SET NULL), per intended schema.
  IF to_regclass('public.school_contract_templates') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.school_contracts'::regclass
         AND contype = 'f'
         AND conname = 'school_contracts_template_id_fkey'
     ) THEN
    ALTER TABLE public.school_contracts
      ADD CONSTRAINT school_contracts_template_id_fkey
      FOREIGN KEY (template_id) REFERENCES public.school_contract_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Make PostgREST pick up the new relationships without waiting for the next reload.
NOTIFY pgrst, 'reload schema';
