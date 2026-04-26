-- B3: Multiple payment methods per student
CREATE TABLE IF NOT EXISTS public.student_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  payment_method text NOT NULL CHECK (payment_method IN ('stripe', 'manual', 'bank_transfer', 'cash')),
  is_default boolean NOT NULL DEFAULT false,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_payment_methods_student
  ON public.student_payment_methods(student_id);
