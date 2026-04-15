-- Allow deleting auth users: when user is deleted, set students.linked_user_id to NULL
-- (student record stays for the tutor; the person just can't log in anymore)

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_linked_user_id_fkey;

ALTER TABLE public.students
  ADD CONSTRAINT students_linked_user_id_fkey
  FOREIGN KEY (linked_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
