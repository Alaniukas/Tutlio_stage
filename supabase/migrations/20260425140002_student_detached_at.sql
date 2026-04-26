-- A6: Soft detach students from organization instead of hard delete
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS detached_at timestamptz;
