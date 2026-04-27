ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS child_birth_date date;
