-- Fix: break possible RLS recursion between `students` and `parent_students`.
--
-- Symptoms:
-- - "infinite recursion detected in policy for relation \"students\"" OR
-- - "infinite recursion detected in policy for relation \"parent_students\""
--
-- Root cause:
-- - `students_parent_select` policy references `parent_students`
-- - `parent_students` policies reference `students` (directly or indirectly)
--
-- Solution:
-- - Use SECURITY DEFINER helpers with `row_security = off` so policy evaluation
--   can check relationships without invoking RLS on the other table.

-- Parent can access student (owns parent_profile linked via parent_students)
CREATE OR REPLACE FUNCTION public.parent_can_access_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.parent_students ps
    JOIN public.parent_profiles pp ON pp.id = ps.parent_id
    WHERE ps.student_id = p_student_id
      AND pp.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.parent_can_access_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parent_can_access_student(uuid) TO authenticated, service_role;

-- Recreate `students_parent_select` to avoid direct `parent_students` subquery
DROP POLICY IF EXISTS "students_parent_select" ON public.students;
CREATE POLICY "students_parent_select" ON public.students FOR SELECT
  USING (public.parent_can_access_student(id));

-- Make `parent_students` policies non-recursive and explicit.
-- (Drop + recreate known policies from audit migration.)
DROP POLICY IF EXISTS "parent_students_select_own" ON public.parent_students;
DROP POLICY IF EXISTS "parent_students_select_tutor" ON public.parent_students;
DROP POLICY IF EXISTS "parent_students_select_org_admin" ON public.parent_students;

CREATE POLICY "parent_students_select_own" ON public.parent_students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_profiles pp
      WHERE pp.id = parent_students.parent_id
        AND pp.user_id = auth.uid()
    )
  );

CREATE POLICY "parent_students_select_tutor" ON public.parent_students
  FOR SELECT USING (
    public.tutor_can_access_student(parent_students.student_id)
  );

CREATE POLICY "parent_students_select_org_admin" ON public.parent_students
  FOR SELECT USING (
    public.org_admin_can_access_student(parent_students.student_id)
  );

