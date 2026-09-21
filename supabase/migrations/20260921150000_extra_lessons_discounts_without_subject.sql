-- A signed group contract can have no subject_id. Its discount is scoped by contract_id,
-- so requiring a subject would prevent addenda for valid groups.
ALTER TABLE public.school_discount_agreements
  ALTER COLUMN subject_id DROP NOT NULL;

COMMENT ON COLUMN public.school_discount_agreements.subject_id IS
  'Optional activity metadata; contract_id, not subject_id, defines the discounted service.';
