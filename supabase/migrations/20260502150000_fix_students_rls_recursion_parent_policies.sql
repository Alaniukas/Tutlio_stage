-- Fix: infinite recursion in RLS policies involving `students` ↔ `parent_students`.
--
-- Problem:
-- - `students_parent_select` policy references `parent_students`
-- - `parent_students_select_org_admin` / `parent_students_select_tutor` policies reference `students`
-- This creates an evaluation loop for authenticated users (e.g. org admins selecting students).
--
-- Solution:
-- Route `parent_students` org-admin/tutor checks through SECURITY DEFINER helpers
-- with `row_security = off` so they can inspect `students` without invoking RLS again.

-- Helper: org admin can access student (by student's organization_id)
CREATE OR REPLACE FUNCTION public.org_admin_can_access_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.organization_admins oa
      ON oa.organization_id = s.organization_id
    WHERE s.id = p_student_id
      AND oa.user_id = auth.uid()
  );
$$;

-- Helper: tutor can access student (by students.tutor_id)
CREATE OR REPLACE FUNCTION public.tutor_can_access_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = p_student_id
      AND s.tutor_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.org_admin_can_access_student(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tutor_can_access_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_admin_can_access_student(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tutor_can_access_student(uuid) TO authenticated, service_role;

-- Replace recursive parent_students policies
DROP POLICY IF EXISTS "parent_students_select_tutor" ON public.parent_students;
CREATE POLICY "parent_students_select_tutor" ON public.parent_students
  FOR SELECT USING (
    public.tutor_can_access_student(parent_students.student_id)
  );

DROP POLICY IF EXISTS "parent_students_select_org_admin" ON public.parent_students;
CREATE POLICY "parent_students_select_org_admin" ON public.parent_students
  FOR SELECT USING (
    public.org_admin_can_access_student(parent_students.student_id)
  );

