-- PostgREST needs a FK from school_contracts.student_id → students.id for student:students(...) embeds.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'school_contracts_student_id_fkey'
      AND conrelid = 'public.school_contracts'::regclass
  ) THEN
    ALTER TABLE public.school_contracts
      ADD CONSTRAINT school_contracts_student_id_fkey
      FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
