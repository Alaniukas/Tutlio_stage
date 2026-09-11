ALTER TABLE public.tutor_invites
  ADD COLUMN IF NOT EXISTS help_team_category text;

COMMENT ON COLUMN public.tutor_invites.help_team_category IS
  'Pagalbos komandos kategorija (speech, psychologist, special_pedagogue, additional_help); nukopijuojama į profiles claim metu.';
