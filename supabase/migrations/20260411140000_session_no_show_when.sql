-- Kai status = no_show: kada pažymėta neatvykimas (prieš / per / po pamokos).

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS no_show_when text
  CHECK (no_show_when IS NULL OR no_show_when IN ('before_lesson', 'during_lesson', 'after_lesson'));

COMMENT ON COLUMN public.sessions.no_show_when IS
  'Jei status = no_show: ar neatvykimas fiksuotas prieš pamoką, jos metu ar po jos.';
