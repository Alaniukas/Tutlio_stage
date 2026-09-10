DROP POLICY IF EXISTS "subjects_select_parent_child" ON public.subjects;
CREATE POLICY "subjects_select_parent_child" ON public.subjects
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.parent_profiles pp
      JOIN public.parent_students ps ON ps.parent_id = pp.id
      JOIN public.students st ON st.id = ps.student_id
      WHERE pp.user_id = auth.uid()
        AND st.tutor_id = subjects.tutor_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.students st
      WHERE st.parent_user_id = auth.uid()
        AND st.tutor_id = subjects.tutor_id
    )
  );;
