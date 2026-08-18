-- Free-text note for org admins: which subjects/grades a tutor teaches
-- (e.g. "MAT 2-6 kls, LT 1-8 kls"). Shown as a badge next to the tutor name.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS teaching_notes text;

COMMENT ON COLUMN public.profiles.teaching_notes IS
  'Free-text note for org admins: subjects/grades the tutor teaches (e.g. MAT 2-6 kls, LT 1-8 kls).';

ALTER TABLE public.tutor_invites
  ADD COLUMN IF NOT EXISTS teaching_notes text;

COMMENT ON COLUMN public.tutor_invites.teaching_notes IS
  'Optional teaching notes copied onto the tutor profile when the invite is claimed.';
