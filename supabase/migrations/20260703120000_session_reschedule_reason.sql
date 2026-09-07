-- Mandatory reschedule reason (tutor / org-admin initiated moves).
-- Mirrors sessions.cancellation_reason. Overwritten with the latest reason on
-- every tutor/org-admin time change; student-initiated reschedules do not set it.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS reschedule_reason text DEFAULT NULL;

COMMENT ON COLUMN public.sessions.reschedule_reason IS
  'Reason for the most recent tutor/org-admin reschedule (min 5 chars in UI). Visible to the student, parents and org admins.';
