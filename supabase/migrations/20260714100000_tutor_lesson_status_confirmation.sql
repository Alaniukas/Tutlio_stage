-- Org feature "tutor_lesson_status_confirmation": lessons of flagged orgs are NOT
-- auto-completed by cron. After a lesson ends the tutor must confirm its outcome
-- (įvyko / įvyko-bet-vėlavo / neatvyko / atšaukta); until then the lesson stays
-- 'active', shows as a must-do task and the tutor gets recurring email reminders.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS completed_late boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_reminder_last_sent_at timestamptz;

COMMENT ON COLUMN public.sessions.completed_late IS
  'Tutor-confirmed "įvyko, bet vėlavo": lesson happened but started late. Billing-wise identical to completed.';
COMMENT ON COLUMN public.sessions.status_confirmed_at IS
  'When a tutor/org admin explicitly confirmed the post-lesson status (orgs with tutor_lesson_status_confirmation).';
COMMENT ON COLUMN public.sessions.status_confirmed_by IS
  'Who confirmed the post-lesson status.';
COMMENT ON COLUMN public.sessions.status_reminder_last_sent_at IS
  'Last "confirm lesson status" reminder email sent to the tutor; throttles the reminder cron.';

-- Queue/reminder queries scan active sessions per tutor ordered by end time.
CREATE INDEX IF NOT EXISTS idx_sessions_active_by_tutor_end
  ON public.sessions (tutor_id, end_time)
  WHERE status = 'active';

-- Pro Klasė asked for this workflow — turn the flag on for them.
UPDATE public.organizations
SET features = jsonb_set(coalesce(features, '{}'::jsonb), '{tutor_lesson_status_confirmation}', 'true'::jsonb)
WHERE id = '3422031d-6e21-424d-980b-35a9c6d7b8f1'
   OR lower(trim(name)) = lower('Pro Klasė');
