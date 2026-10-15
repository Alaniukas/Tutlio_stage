-- The parent portal offers a whiteboard link for a child's lesson. Allow the
-- same live guardian relationship used by sessions RLS to read its saved scene
-- and image assets. The assigned tutor remains the scene writer in the UI.
-- Keep sessions RLS (including school family scope) and Storage's restrictive
-- org-admin permission policies in force, and use the indexed session ID.
CREATE POLICY "Parent reads child whiteboard data" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'whiteboard-data'
  AND EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = private.whiteboard_object_session_id(name)
      AND public.parent_can_access_student(s.student_id)
  )
);
