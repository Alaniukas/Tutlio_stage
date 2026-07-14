-- Open-ended recurring schedules are stored as lightweight templates. Only a
-- short rolling calendar window is materialized by a daily server job.
ALTER TABLE public.recurring_individual_sessions
  ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'weekly';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'recurring_individual_sessions_frequency_check'
      AND conrelid = 'public.recurring_individual_sessions'::regclass
  ) THEN
    ALTER TABLE public.recurring_individual_sessions
      ADD CONSTRAINT recurring_individual_sessions_frequency_check
      CHECK (frequency IN ('weekly', 'biweekly', 'monthly'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recurring_individual_sessions_open_active
  ON public.recurring_individual_sessions (start_date, tutor_id)
  WHERE active = true AND end_date IS NULL;

COMMENT ON COLUMN public.recurring_individual_sessions.frequency IS
  'Recurrence interval used by the rolling session materializer.';
