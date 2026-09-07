-- Restore the intended foreign key on public.school_payment_installments.
-- 20260420000001_unify_schools_into_orgs.sql defined contract_id's FK inside a
-- CREATE TABLE IF NOT EXISTS. Where the table already existed, that block was a
-- no-op, so school_payment_installments_contract_id_fkey was never created.
-- Without it, PostgREST cannot resolve the contract:school_contracts(...) embed
-- used by /api/pay-school-installment, /api/school-installment-reminders,
-- CompanyPayments, CompanyDashboard and the student/parent dashboards — the whole
-- .select() fails and surfaces to payers as "Įmoka nerasta".

DO $$
BEGIN
  IF to_regclass('public.school_payment_installments') IS NULL
     OR to_regclass('public.school_contracts') IS NULL THEN
    RAISE NOTICE 'Skipping migration: school payment tables do not exist in this database.';
    RETURN;
  END IF;

  -- The intended FK is ON DELETE CASCADE, so any installment whose contract was
  -- already deleted is a dangling row the cascade would have removed. Clean these
  -- up first; otherwise ADD CONSTRAINT (validated) would fail. Scoped to true
  -- orphans only (non-null contract_id with no matching contract).
  DELETE FROM public.school_payment_installments i
  WHERE i.contract_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.school_contracts c WHERE c.id = i.contract_id
    );

  -- contract_id -> school_contracts.id (ON DELETE CASCADE), per intended schema.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.school_payment_installments'::regclass
      AND contype = 'f'
      AND conname = 'school_payment_installments_contract_id_fkey'
  ) THEN
    ALTER TABLE public.school_payment_installments
      ADD CONSTRAINT school_payment_installments_contract_id_fkey
      FOREIGN KEY (contract_id) REFERENCES public.school_contracts(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Make PostgREST pick up the new relationship without waiting for the next reload.
NOTIFY pgrst, 'reload schema';
