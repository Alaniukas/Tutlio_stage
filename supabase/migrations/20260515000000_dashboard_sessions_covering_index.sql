-- Non-partial composite index for the tutor dashboard sessions query.
-- The existing idx_sessions_tutor_start_time has WHERE status != 'cancelled'
-- which prevents it from being used when the dashboard fetches all statuses.
CREATE INDEX IF NOT EXISTS idx_sessions_tutor_start_all
  ON public.sessions (tutor_id, start_time)
  INCLUDE (status, paid, price, student_id, subject_id);

-- Index for lesson_packages recent paid lookup (dashboard recent payments)
CREATE INDEX IF NOT EXISTS idx_lesson_packages_tutor_paid_at
  ON public.lesson_packages (tutor_id, paid_at DESC NULLS LAST)
  WHERE paid IS TRUE AND paid_at IS NOT NULL;
