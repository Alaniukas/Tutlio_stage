ALTER TABLE public.tutor_invites
  ADD COLUMN IF NOT EXISTS personal_meeting_link text;
