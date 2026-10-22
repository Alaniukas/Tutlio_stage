-- Keep the existing sessions/student RLS in force. A typed, single-session
-- invoker lookup prevents Storage list queries from planning permission checks
-- across unrelated lessons. No service-role or elevated lookup is introduced.
CREATE OR REPLACE FUNCTION private.session_files_object_session_id(p_name text)
RETURNS uuid LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path = '' AS $$
  SELECT CASE WHEN split_part(p_name, '/', 1) ~
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  THEN split_part(p_name, '/', 1)::uuid ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION private.lesson_storage_access(p_session_id uuid, p_access text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
BEGIN
  IF caller_id IS NULL OR p_session_id IS NULL THEN RETURN false; END IF;
  IF p_access = 'tutor' THEN
    RETURN EXISTS (SELECT 1 FROM public.sessions s
      WHERE s.id = p_session_id AND s.tutor_id = caller_id);
  ELSIF p_access = 'student' THEN
    RETURN EXISTS (SELECT 1 FROM public.sessions s
      JOIN public.students st ON st.id = s.student_id
      WHERE s.id = p_session_id AND st.linked_user_id = caller_id);
  ELSIF p_access = 'parent' THEN
    RETURN EXISTS (SELECT 1 FROM public.sessions s
      WHERE s.id = p_session_id AND public.parent_can_access_student(s.student_id));
  ELSIF p_access = 'org_admin' THEN
    RETURN EXISTS (SELECT 1 FROM public.sessions s
      JOIN public.profiles p ON p.id = s.tutor_id
      JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE s.id = p_session_id AND oa.user_id = caller_id);
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION private.session_files_object_session_id(text),
  private.lesson_storage_access(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.session_files_object_session_id(text),
  private.lesson_storage_access(uuid,text) TO authenticated;

DROP POLICY IF EXISTS "Tutor manages session files" ON storage.objects;
CREATE POLICY "Tutor manages session files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'session-files' AND private.lesson_storage_access(private.session_files_object_session_id(name), 'tutor'));

DROP POLICY IF EXISTS "Student downloads session files" ON storage.objects;
CREATE POLICY "Student downloads session files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'session-files' AND private.lesson_storage_access(private.session_files_object_session_id(name), 'student'));

DROP POLICY IF EXISTS "Tutor manages session files insert" ON storage.objects;
CREATE POLICY "Tutor manages session files insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'session-files'
  AND private.lesson_storage_access(private.session_files_object_session_id(name), 'tutor')
  AND NOT public.write_blocked_by_org_suspension());

DROP POLICY IF EXISTS "Tutor manages session files update" ON storage.objects;
CREATE POLICY "Tutor manages session files update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'session-files'
  AND private.lesson_storage_access(private.session_files_object_session_id(name), 'tutor')
  AND NOT public.write_blocked_by_org_suspension())
WITH CHECK (bucket_id = 'session-files'
  AND private.lesson_storage_access(private.session_files_object_session_id(name), 'tutor')
  AND NOT public.write_blocked_by_org_suspension());

DROP POLICY IF EXISTS "Tutor manages session files delete" ON storage.objects;
CREATE POLICY "Tutor manages session files delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'session-files'
  AND private.lesson_storage_access(private.session_files_object_session_id(name), 'tutor')
  AND NOT public.write_blocked_by_org_suspension());

DROP POLICY IF EXISTS "Tutor manages whiteboard data" ON storage.objects;
CREATE POLICY "Tutor manages whiteboard data" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'whiteboard-data' AND private.lesson_storage_access(private.whiteboard_object_session_id(name), 'tutor'))
WITH CHECK (bucket_id = 'whiteboard-data' AND private.lesson_storage_access(private.whiteboard_object_session_id(name), 'tutor'));

DROP POLICY IF EXISTS "Student manages whiteboard data" ON storage.objects;
CREATE POLICY "Student manages whiteboard data" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'whiteboard-data' AND private.lesson_storage_access(private.whiteboard_object_session_id(name), 'student'))
WITH CHECK (bucket_id = 'whiteboard-data' AND private.lesson_storage_access(private.whiteboard_object_session_id(name), 'student'));

DROP POLICY IF EXISTS "Org admin reads whiteboard data" ON storage.objects;
CREATE POLICY "Org admin reads whiteboard data" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'whiteboard-data' AND private.lesson_storage_access(private.whiteboard_object_session_id(name), 'org_admin'));

DROP POLICY IF EXISTS "Parent reads child whiteboard data" ON storage.objects;
CREATE POLICY "Parent reads child whiteboard data" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'whiteboard-data' AND private.lesson_storage_access(private.whiteboard_object_session_id(name), 'parent'));
