-- Partial indexes for payment cron queries (reduces full-table scans on sessions)
CREATE INDEX IF NOT EXISTS idx_sessions_deadline_warning_pending
  ON public.sessions (start_time)
  WHERE status = 'active' AND paid = false AND payment_deadline_warning_sent IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_after_lesson_reminder_pending
  ON public.sessions (end_time)
  WHERE status = 'active' AND paid = false
    AND (payment_after_lesson_reminder_sent IS NULL OR payment_after_lesson_reminder_sent = false);

-- Flag for whiteboard data cleanup (2 h after session end)
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS whiteboard_data_cleaned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sessions_whiteboard_cleanup
  ON public.sessions (end_time)
  WHERE whiteboard_data_cleaned = false
    AND whiteboard_room_id IS NOT NULL
    AND status IN ('completed', 'cancelled');
