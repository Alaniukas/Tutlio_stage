ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS exclude_from_lesson_count boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sessions.exclude_from_lesson_count IS
  'Excludes an administrative duplicate from conducted-lesson counters only. Revenue, payment status, tutor pay, invoices, and lesson history remain unchanged.';
