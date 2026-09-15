-- Org feature `org_tutor_availability_only`: org tutors can only create availability,
-- not lessons or recurring templates. Org admins keep creating via separate policies.

CREATE OR REPLACE FUNCTION public.org_tutor_session_create_disabled(p_tutor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT public.org_has_feature(p.organization_id, 'org_tutor_availability_only')
      FROM public.profiles p
      WHERE p.id = p_tutor_id
        AND p.organization_id IS NOT NULL
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.org_tutor_session_create_disabled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_tutor_session_create_disabled(uuid) TO authenticated;

DROP POLICY IF EXISTS "sessions_insert" ON public.sessions;
CREATE POLICY "sessions_insert" ON public.sessions
  FOR INSERT
  WITH CHECK (
    (
      (
        auth.uid() = tutor_id
        AND NOT public.org_tutor_session_create_disabled(tutor_id)
      )
      OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
      OR public.parent_can_access_student(student_id)
    )
    AND NOT public.student_self_booking_disabled(student_id)
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "Tutor recurring insert" ON public.recurring_individual_sessions;
CREATE POLICY "Tutor recurring insert" ON public.recurring_individual_sessions
  FOR INSERT
  WITH CHECK (
    tutor_id = auth.uid()
    AND NOT public.org_tutor_session_create_disabled(tutor_id)
    AND NOT public.write_blocked_by_org_suspension()
  );;
