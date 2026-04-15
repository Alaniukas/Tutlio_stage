-- Fix missing SELECT policy on student_individual_pricing
-- Previous migration dropped it but never recreated it

-- Tutors can view their own student pricing
DROP POLICY IF EXISTS "Tutors can view own student pricing" ON public.student_individual_pricing;
CREATE POLICY "Tutors can view own student pricing"
  ON public.student_individual_pricing FOR SELECT
  USING (tutor_id = auth.uid());

-- Students can view their own pricing
DROP POLICY IF EXISTS "Students can view own pricing" ON public.student_individual_pricing;
CREATE POLICY "Students can view own pricing"
  ON public.student_individual_pricing FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE linked_user_id = auth.uid()
    )
  );

-- Org admins can view pricing for students of tutors in their org
DROP POLICY IF EXISTS "Org admins can view org student pricing" ON public.student_individual_pricing;

CREATE POLICY "Org admins can view org student pricing"
  ON public.student_individual_pricing FOR SELECT
  USING (
    tutor_id IN (
      SELECT id FROM public.profiles
      WHERE organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
    )
  );
