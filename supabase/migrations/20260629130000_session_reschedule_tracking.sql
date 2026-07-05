-- Session reschedule tracking (Pro Klase intake funnel, Phase 2, req 6)
--
-- Calendar-month packages let a tutor move a lesson to another time WITHIN the
-- same calendar month. Moved lessons get a distinct visual indicator in the
-- calendars. To support both, we record:
--   * original_start_time -> the first scheduled start before any move (set once)
--   * rescheduled_at       -> when the lesson was last moved
--
-- A lesson is considered "moved" when original_start_time IS NOT NULL.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS original_start_time timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rescheduled_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.sessions.original_start_time IS
  'The lesson''s first scheduled start before any reschedule (set once on the first move). When NOT NULL the lesson was moved (req 6, monthly_packages).';

COMMENT ON COLUMN public.sessions.rescheduled_at IS
  'Timestamp of the most recent reschedule of this lesson (req 6).';
