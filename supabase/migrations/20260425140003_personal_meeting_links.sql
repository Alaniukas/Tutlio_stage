-- A7: Tutor custom permanent meeting link
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS personal_meeting_link text;

-- A8: Student custom permanent meeting link
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS personal_meeting_link text;
