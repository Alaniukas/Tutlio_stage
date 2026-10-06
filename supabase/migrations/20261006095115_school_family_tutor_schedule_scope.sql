-- Enabling the family portal must preserve the school tutor access already
-- granted by students_school_group_or_session_tutor_select and sessions_select.
-- School group children often have students.tutor_id = NULL; their teacher is
-- identified by a group membership or an existing session instead.
CREATE OR REPLACE FUNCTION public.school_family_student_scope_allowed(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.organizations o ON o.id = s.organization_id
    WHERE s.id = p_student_id AND o.entity_type = 'school'
      AND o.features->'school_family_portal' = 'true'::jsonb
  )
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = p_student_id AND s.linked_user_id = (SELECT auth.uid())
    )
    OR public.parent_can_access_student(p_student_id)
    OR public.tutor_can_access_student(p_student_id)
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND public.tutor_can_view_student_via_school_links(p_student_id, (SELECT auth.uid()))
    )
    OR public.org_admin_can_access_student(p_student_id);
$$;

REVOKE ALL ON FUNCTION public.school_family_student_scope_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_family_student_scope_allowed(uuid) TO authenticated, service_role;
