-- Fix infinite recursion on parent_students RLS.
-- Root cause: parent_students_select_own referenced parent_profiles, while parent_profiles policies
-- referenced parent_students -> recursion loop.
--
-- This migration force-replaces parent_students policies to ensure none reference parent_profiles.

-- Ensure helper exists (created earlier, but keep idempotent).
CREATE OR REPLACE FUNCTION public.get_my_parent_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT pp.id
  FROM public.parent_profiles pp
  WHERE pp.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_parent_profile_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_parent_profile_id() TO authenticated, service_role;

-- Drop all parent_students policies and recreate.
DROP POLICY IF EXISTS "parent_students_select_own" ON public.parent_students;
DROP POLICY IF EXISTS "parent_students_select_tutor" ON public.parent_students;
DROP POLICY IF EXISTS "parent_students_select_org_admin" ON public.parent_students;

CREATE POLICY "parent_students_select_own" ON public.parent_students
  FOR SELECT USING (parent_id = public.get_my_parent_profile_id());

CREATE POLICY "parent_students_select_tutor" ON public.parent_students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = parent_students.student_id
        AND s.tutor_id = auth.uid()
    )
  );

CREATE POLICY "parent_students_select_org_admin" ON public.parent_students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.profiles p ON p.id = s.tutor_id
      JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE s.id = parent_students.student_id
        AND oa.user_id = auth.uid()
    )
  );

