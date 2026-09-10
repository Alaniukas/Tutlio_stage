-- Migration: Add 'no_show' as a valid session status
-- The sessions.status column is TEXT with a CHECK constraint.
-- We drop the old constraint and recreate it to include 'no_show'.

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_status_check;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_status_check
  CHECK (status IN ('active', 'cancelled', 'completed', 'no_show'));
COMMENT ON COLUMN public.sessions.status IS
  'Session status: active | cancelled | completed | no_show (student did not attend)';
