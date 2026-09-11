ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS show_comment_to_parent boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sessions.show_comment_to_parent IS
  'Tutor chose to publish the lesson comment to the parent portal and notify parent email addresses.';
