-- Prevent a student row from pointing linked auth user at the same profile as tutor_id.
ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_linked_user_not_self_tutor;

ALTER TABLE public.students
  ADD CONSTRAINT students_linked_user_not_self_tutor
  CHECK (
    linked_user_id IS NULL
    OR tutor_id IS NULL
    OR linked_user_id <> tutor_id
  );
