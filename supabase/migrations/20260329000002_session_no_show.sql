-- Session status: student did not attend (individual lessons only in UI)
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_status_check;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_status_check
  CHECK (status IN ('active', 'cancelled', 'completed', 'no_show'));

COMMENT ON CONSTRAINT sessions_status_check ON public.sessions IS
  'no_show = lesson time passed but this enrollment did not attend; for group lessons each student has a separate session row';
