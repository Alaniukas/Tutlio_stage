-- Fix 42P17 infinite recursion: students_school_group_or_session_tutor_select
-- queried sessions, whose sessions_select policy subqueries students again.

CREATE OR REPLACE FUNCTION public.tutor_can_view_student_via_school_links(
  p_student_id uuid,
  p_tutor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.student_id = p_student_id
      AND s.tutor_id = p_tutor_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.school_class_group_members m
    JOIN public.school_class_groups g ON g.id = m.group_id
    WHERE m.student_id = p_student_id
      AND g.tutor_id = p_tutor_id
  );
$$;

REVOKE ALL ON FUNCTION public.tutor_can_view_student_via_school_links(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tutor_can_view_student_via_school_links(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS students_school_group_or_session_tutor_select ON public.students;
DROP POLICY IF EXISTS sessions_school_group_or_session_tutor_select ON public.students;
CREATE POLICY students_school_group_or_session_tutor_select ON public.students
  FOR SELECT
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND public.tutor_can_view_student_via_school_links(
      students.id,
      (SELECT auth.uid())
    )
  );
