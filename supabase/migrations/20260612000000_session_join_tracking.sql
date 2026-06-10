-- Session join (attendance) tracking
-- Records the FIRST "join lesson" click per side (tutor / student+parent).
-- Clicks are recorded only within a window from 30 min before start_time
-- until end_time (enforced in app code / api/join-session.ts).
-- Attendance flags are derived at read time (no cron):
--   flagged = not cancelled AND now > start_time + 10 min
--             AND (side joined_at IS NULL OR joined_at > start_time + 10 min).

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS tutor_joined_at timestamptz,
  ADD COLUMN IF NOT EXISTS student_joined_at timestamptz;

-- Admin attendance view filters by start_time ranges.
CREATE INDEX IF NOT EXISTS idx_sessions_start_time
  ON public.sessions(start_time);

COMMENT ON COLUMN public.sessions.tutor_joined_at IS
  'First time the tutor clicked the lesson join link (in-app button or tracked email/calendar link).';
COMMENT ON COLUMN public.sessions.student_joined_at IS
  'First time the student or their parent clicked the lesson join link (in-app button or tracked email link).';
