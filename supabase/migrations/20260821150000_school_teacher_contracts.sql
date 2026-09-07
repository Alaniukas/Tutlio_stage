-- Teacher (staff) contracts for school orgs: same e-sign chain as student/parent
-- contracts, but no student, no placeholders, no completion form, no payments.
--
-- party_kind = 'teacher'  → student_id IS NULL, counterparty is the teacher.
-- Existing rows stay party_kind = 'student'.

ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS party_kind text NOT NULL DEFAULT 'student';

ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS counterparty_name text;

ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS counterparty_email text;

ALTER TABLE public.school_contracts
  ALTER COLUMN student_id DROP NOT NULL;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.school_contracts'::regclass
      AND contype = 'c'
      AND (conname LIKE '%party_kind%' OR conname LIKE '%party_student%')
  LOOP
    EXECUTE 'ALTER TABLE public.school_contracts DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE public.school_contracts
  ADD CONSTRAINT school_contracts_party_kind_check
  CHECK (party_kind IN ('student', 'teacher'));

ALTER TABLE public.school_contracts
  ADD CONSTRAINT school_contracts_party_student_ck
  CHECK (
    (party_kind = 'student' AND student_id IS NOT NULL)
    OR (party_kind = 'teacher' AND student_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_school_contracts_org_party
  ON public.school_contracts(organization_id, party_kind)
  WHERE archived_at IS NULL;

COMMENT ON COLUMN public.school_contracts.party_kind IS
  'student = ugdymo sutartis su mokiniu/tėvais; teacher = paruošta sutartis su mokytoju (be dinaminių laukų).';
COMMENT ON COLUMN public.school_contracts.counterparty_name IS
  'Teacher (or other counterparty) display name when party_kind = teacher.';
COMMENT ON COLUMN public.school_contracts.counterparty_email IS
  'Teacher email for the signing invite when party_kind = teacher.';

-- Signature role: teacher is the second signer (after school), same as parent_primary.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.school_contract_signatures'::regclass
      AND contype = 'c'
      AND conname LIKE '%role%'
  LOOP
    EXECUTE 'ALTER TABLE public.school_contract_signatures DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE public.school_contract_signatures
  ADD CONSTRAINT school_contract_signatures_role_check
  CHECK (role IN ('school', 'parent_primary', 'parent_secondary', 'teacher'));
