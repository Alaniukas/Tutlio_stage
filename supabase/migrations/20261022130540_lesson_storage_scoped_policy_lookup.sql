-- Storage's ILIKE listing applies RLS before narrowing by folder. Avoid entering
-- sessions/student RLS for every unrelated object in the bucket. This private
-- lookup reads one primary-key row, checks the caller's exact original role,
-- then enforces all three restrictive sessions SELECT rules explicitly.
CREATE OR REPLACE FUNCTION private.lesson_storage_access(p_session_id uuid, p_access text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  lesson_tutor_id uuid;
  lesson_student_id uuid;
  actor_allowed boolean := false;
BEGIN
  IF caller_id IS NULL OR p_session_id IS NULL THEN RETURN false; END IF;
  SELECT s.tutor_id, s.student_id INTO lesson_tutor_id, lesson_student_id
  FROM public.sessions s WHERE s.id = p_session_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF p_access = 'tutor' THEN
    actor_allowed := lesson_tutor_id = caller_id;
  ELSIF p_access = 'student' THEN
    SELECT EXISTS (SELECT 1 FROM public.students st
      WHERE st.id = lesson_student_id AND st.linked_user_id = caller_id) INTO actor_allowed;
  ELSIF p_access = 'parent' THEN
    actor_allowed := public.parent_can_access_student(lesson_student_id);
  ELSIF p_access = 'org_admin' THEN
    SELECT EXISTS (SELECT 1 FROM public.profiles p
      JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE p.id = lesson_tutor_id AND oa.user_id = caller_id) INTO actor_allowed;
  END IF;
  IF actor_allowed IS NOT TRUE THEN RETURN false; END IF;

  -- Mirrors require_active_auth_session, org_admin_permission_select and
  -- school_family_session_read_scope. Storage's own restrictive read/write
  -- policies remain in place, including suspension and edit permissions.
  IF NOT private.has_active_auth_session() THEN RETURN false; END IF;
  IF NOT private.org_admin_permission_gate(ARRAY[
    'dashboard.view','sessions.view','sessions.edit','stats.view','finance.view','finance.edit'
  ]::text[]) THEN RETURN false; END IF;
  RETURN public.school_family_student_scope_allowed(lesson_student_id);
END;
$$;
REVOKE ALL ON FUNCTION private.lesson_storage_access(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.lesson_storage_access(uuid,text) TO authenticated;
