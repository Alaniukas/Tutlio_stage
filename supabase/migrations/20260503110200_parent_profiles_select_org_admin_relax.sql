-- Relax parent_profiles_select_org_admin: org admin should be able to read
-- parent_profiles for any student in their organization, regardless of tutor
-- assignment. Previous version joined through students.tutor_id which excluded
-- parents whose child has no tutor (or tutor outside the org).
--
-- This makes the org admin chat picker reliable for messaging parents and
-- avoids confusing "parent missing from contacts" cases.

DROP POLICY IF EXISTS "parent_profiles_select_org_admin" ON public.parent_profiles;
CREATE POLICY "parent_profiles_select_org_admin" ON public.parent_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.parent_students ps
      JOIN public.students s ON s.id = ps.student_id
      JOIN public.organization_admins oa ON oa.organization_id = s.organization_id
      WHERE ps.parent_id = parent_profiles.id
        AND oa.user_id = auth.uid()
    )
  );
