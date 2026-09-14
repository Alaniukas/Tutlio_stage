-- Pro Klasė: org admin can void a penalty without deleting the row (cron dedupe stays intact).

ALTER TABLE public.tutor_adjustments
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tutor_adjustments_active_org_tutor_idx
  ON public.tutor_adjustments (organization_id, tutor_id, created_at DESC)
  WHERE voided_at IS NULL;

COMMENT ON COLUMN public.tutor_adjustments.voided_at IS
  'When set, this adjustment is excluded from tutor pay totals but still blocks automatic re-penalties for the same session.';;
