-- Casting sessions.id to text forced Storage permission checks through scans
-- of unrelated sessions and their school-family RLS. Look up the one session
-- by its UUID primary key instead. Keep the existing participant checks and
-- underlying table RLS, including org-admin seat/permission restrictions.
CREATE OR REPLACE FUNCTION private.whiteboard_object_session_id(p_object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN split_part(p_object_name, '/', 1)::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.whiteboard_object_session_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.whiteboard_object_session_id(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Tutor manages whiteboard data" ON storage.objects;
CREATE POLICY "Tutor manages whiteboard data" ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'whiteboard-data'
  AND EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = private.whiteboard_object_session_id(name)
      AND s.tutor_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'whiteboard-data'
  AND EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = private.whiteboard_object_session_id(name)
      AND s.tutor_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Student manages whiteboard data" ON storage.objects;
CREATE POLICY "Student manages whiteboard data" ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'whiteboard-data'
  AND EXISTS (
    SELECT 1 FROM public.sessions s
    JOIN public.students st ON st.id = s.student_id
    WHERE s.id = private.whiteboard_object_session_id(name)
      AND st.linked_user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'whiteboard-data'
  AND EXISTS (
    SELECT 1 FROM public.sessions s
    JOIN public.students st ON st.id = s.student_id
    WHERE s.id = private.whiteboard_object_session_id(name)
      AND st.linked_user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Org admin reads whiteboard data" ON storage.objects;
CREATE POLICY "Org admin reads whiteboard data" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'whiteboard-data'
  AND EXISTS (
    SELECT 1 FROM public.sessions s
    JOIN public.profiles p ON p.id = s.tutor_id
    JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
    WHERE s.id = private.whiteboard_object_session_id(name)
      AND oa.user_id = (SELECT auth.uid())
  )
);
