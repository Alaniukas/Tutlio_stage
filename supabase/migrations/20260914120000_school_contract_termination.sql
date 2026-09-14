-- Auditable school-side termination for annual and extra-lessons contracts.
-- The signed agreement remains immutable; these fields describe when service
-- access and future billing stopped.

ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS terminated_at timestamptz,
  ADD COLUMN IF NOT EXISTS termination_reason text,
  ADD COLUMN IF NOT EXISTS terminated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_school_contracts_active_student
  ON public.school_contracts (organization_id, student_id, kind)
  WHERE archived_at IS NULL AND terminated_at IS NULL;

COMMENT ON COLUMN public.school_contracts.terminated_at IS
  'School-side service termination timestamp. Blocks future billing reminders and student lesson join access.';
COMMENT ON COLUMN public.school_contracts.termination_reason IS
  'Administrator-entered reason retained for the contract audit trail.';
COMMENT ON COLUMN public.school_contracts.terminated_by IS
  'Organization administrator who terminated the contract.';
