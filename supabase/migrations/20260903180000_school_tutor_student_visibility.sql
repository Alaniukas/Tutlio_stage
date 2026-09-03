-- School org tutors: read student rows linked to their sessions or class groups.
-- Fixes tutor calendar embed `student:students(...)` returning null when students.tutor_id IS NULL.

DROP POLICY IF EXISTS students_school_group_or_session_tutor_select ON public.students;
CREATE POLICY students_school_group_or_session_tutor_select ON public.students
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.student_id = students.id
        AND s.tutor_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.school_class_group_members m
      JOIN public.school_class_groups g ON g.id = m.group_id
      WHERE m.student_id = students.id
        AND g.tutor_id = (SELECT auth.uid())
    )
  );
