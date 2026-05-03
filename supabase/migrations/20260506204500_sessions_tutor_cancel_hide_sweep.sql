-- Calendar bootstrap: tutor „auto-hide old cancelled“ (tutor_id + cancelled_at)
CREATE INDEX IF NOT EXISTS idx_sessions_tutor_cancelled_hide_sweep
  ON public.sessions (tutor_id, cancelled_at)
  WHERE status = 'cancelled'
    AND COALESCE(hidden_from_calendar, false) = false;
