-- See supabase/migrations/20260910140000_parent_rls_unified_access.sql
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
  )
  OR EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = p_student_id
      AND s.parent_user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.parent_can_access_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parent_can_access_student(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "students_parent_select" ON public.students;
CREATE POLICY "students_parent_select" ON public.students
  FOR SELECT
  USING (public.parent_can_access_student(id));

DROP POLICY IF EXISTS "students_parent_update" ON public.students;
CREATE POLICY "students_parent_update" ON public.students
  FOR UPDATE
  USING (
    public.parent_can_access_student(id)
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (public.parent_can_access_student(id));

DROP POLICY IF EXISTS "sessions_select" ON public.sessions;
CREATE POLICY "sessions_select" ON public.sessions
  FOR SELECT
  USING (
    auth.uid() = tutor_id
    OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    OR public.parent_can_access_student(student_id)
  );

DROP POLICY IF EXISTS "sessions_insert" ON public.sessions;
CREATE POLICY "sessions_insert" ON public.sessions
  FOR INSERT
  WITH CHECK (
    (
      auth.uid() = tutor_id
      OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
      OR public.parent_can_access_student(student_id)
    )
    AND NOT public.student_self_booking_disabled(student_id)
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "sessions_student_update" ON public.sessions;
CREATE POLICY "sessions_student_update" ON public.sessions
  FOR UPDATE
  USING (
    (
      student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
      OR public.parent_can_access_student(student_id)
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    (
      student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
      OR public.parent_can_access_student(student_id)
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "availability_select_parent_child" ON public.availability;
CREATE POLICY "availability_select_parent_child" ON public.availability
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.students st
      WHERE st.tutor_id = availability.tutor_id
        AND public.parent_can_access_student(st.id)
    )
  );

DROP POLICY IF EXISTS "subjects_select_parent_child" ON public.subjects;
CREATE POLICY "subjects_select_parent_child" ON public.subjects
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.students st
      WHERE st.tutor_id = subjects.tutor_id
        AND public.parent_can_access_student(st.id)
    )
  );

DROP POLICY IF EXISTS "school_contracts_parent_select" ON public.school_contracts;
CREATE POLICY "school_contracts_parent_select" ON public.school_contracts
  FOR SELECT
  USING (public.parent_can_access_student(student_id));

DROP POLICY IF EXISTS "school_installments_parent_select" ON public.school_payment_installments;
CREATE POLICY "school_installments_parent_select" ON public.school_payment_installments
  FOR SELECT
  USING (
    contract_id IN (
      SELECT sc.id
      FROM public.school_contracts sc
      WHERE public.parent_can_access_student(sc.student_id)
    )
  );;
