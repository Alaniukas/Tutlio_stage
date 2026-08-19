-- Complimentary (free) lessons: paid for the client, excluded from packages,
-- extra-lesson billing, and client revenue stats.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS is_complimentary boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sessions.is_complimentary IS
  'True when the lesson is given free to the client (partnerships). Does not consume package credits or count toward client billing / dynamic-pricing extras.';

CREATE INDEX IF NOT EXISTS idx_sessions_complimentary_unpaid
  ON public.sessions (tutor_id, start_time)
  WHERE is_complimentary = false AND paid = false;
