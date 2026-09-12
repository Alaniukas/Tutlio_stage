ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS show_comment_to_parent boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sessions.show_comment_to_parent IS
  'When true, tutor comment is visible to parents and may trigger parent email delivery (Mano Korepetitorius).';;
