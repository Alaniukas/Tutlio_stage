-- Covering-ish index for get-occupied-slots: tutor + time range then filter student_id <> child
CREATE INDEX IF NOT EXISTS idx_sessions_tutor_start_include_student
  ON public.sessions (tutor_id, start_time)
  INCLUDE (student_id)
  WHERE status IS DISTINCT FROM 'cancelled';
