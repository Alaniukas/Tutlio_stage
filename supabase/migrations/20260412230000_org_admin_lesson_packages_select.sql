-- Org admins: read lesson_packages for tutors in the same organization (e.g. SF preview / finance UI)
DROP POLICY IF EXISTS "Org admins can view org lesson_packages" ON public.lesson_packages;
CREATE POLICY "Org admins can view org lesson_packages" ON public.lesson_packages FOR SELECT
  USING (
    tutor_id IN (
      SELECT id FROM public.profiles
      WHERE organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
    )
  );
