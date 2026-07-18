-- "Kieno prašymu perkelta?" — when a tutor/org admin moves a lesson they must
-- now record whose request the move was. Feeds the per-student move/cancel
-- counters in the org student card. Same write paths (and RLS) as
-- reschedule_reason (20260703120000).

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS reschedule_requested_by text DEFAULT NULL
  CHECK (reschedule_requested_by IS NULL OR reschedule_requested_by IN ('student', 'tutor'));

COMMENT ON COLUMN public.sessions.reschedule_requested_by IS
  'Who asked for the most recent tutor/org-admin reschedule (student or tutor). NULL for legacy rows and student-initiated self-service moves; stats fall back to reschedule_reason presence for those.';
