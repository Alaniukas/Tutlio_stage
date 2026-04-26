-- A1: Admin comments on students with visibility control
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS admin_comment text,
  ADD COLUMN IF NOT EXISTS admin_comment_visible_to_tutor boolean NOT NULL DEFAULT false;
