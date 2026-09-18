-- A suspension preserves the signed contract and payment history while pausing
-- access, reminders and new billing until it is resumed or its end date passes.

ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS suspension_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_until date,
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS suspension_started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspension_resumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_resumed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_school_contracts_suspended
  ON public.school_contracts (organization_id, suspension_started_at DESC)
  WHERE suspension_started_at IS NOT NULL AND suspension_resumed_at IS NULL;

COMMENT ON COLUMN public.school_contracts.suspension_until IS
  'Inclusive final date of a temporary pause. NULL means paused until an administrator resumes it.';
