-- A group is viable from three active students. When one student's contract
-- exit leaves two or fewer, retain the group definition but pause delivery for
-- every remaining member until the minimum is restored.

ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS suspension_scope text,
  ADD COLUMN IF NOT EXISTS suspension_group_id uuid REFERENCES public.school_class_groups(id) ON DELETE SET NULL;

ALTER TABLE public.school_contracts
  DROP CONSTRAINT IF EXISTS school_contracts_suspension_scope_check;
ALTER TABLE public.school_contracts
  ADD CONSTRAINT school_contracts_suspension_scope_check
  CHECK (suspension_scope IS NULL OR suspension_scope IN ('individual', 'group_under_minimum'));

ALTER TABLE public.school_class_groups
  ADD COLUMN IF NOT EXISTS suspension_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_until date,
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS suspension_trigger_contract_id uuid REFERENCES public.school_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspension_started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspension_resumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_resumed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_school_class_groups_suspended
  ON public.school_class_groups (organization_id, suspension_started_at DESC)
  WHERE suspension_started_at IS NOT NULL AND suspension_resumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_school_contracts_group_suspension
  ON public.school_contracts (class_group_id, suspension_scope)
  WHERE archived_at IS NULL AND class_group_id IS NOT NULL;

COMMENT ON COLUMN public.school_contracts.suspension_scope IS
  'individual = this family contract was paused; group_under_minimum = paused automatically because fewer than three active students remained.';
COMMENT ON COLUMN public.school_class_groups.suspension_trigger_contract_id IS
  'Contract whose suspension or termination caused the group to fall below the three-student minimum.';
