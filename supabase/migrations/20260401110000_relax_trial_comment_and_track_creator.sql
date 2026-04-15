-- Track who created calendar records and relax hard DB enforcement of trial comment.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS created_by_role text NOT NULL DEFAULT 'tutor';

ALTER TABLE public.availability
  ADD COLUMN IF NOT EXISTS created_by_role text NOT NULL DEFAULT 'tutor';

COMMENT ON COLUMN public.sessions.created_by_role IS
  'Who created the session row (e.g., tutor, org_admin, system).';

COMMENT ON COLUMN public.availability.created_by_role IS
  'Who created the availability row (e.g., tutor, org_admin, system).';

DROP TRIGGER IF EXISTS trg_sessions_enforce_trial_completed_comment ON public.sessions;
DROP FUNCTION IF EXISTS public.enforce_trial_completed_comment();

