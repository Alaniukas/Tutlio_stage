-- Ensure RPC function exists in case it was not applied to the live schema.
-- Used by Login.tsx for linking tutor accounts to existing student rows by email.

CREATE OR REPLACE FUNCTION public.get_student_by_email_for_linking(p_email text)
RETURNS TABLE (id uuid, linked_user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.linked_user_id
  FROM public.students s
  WHERE trim(lower(coalesce(s.email, ''))) = trim(lower(coalesce(p_email, '')))
    AND (s.linked_user_id = auth.uid() OR s.linked_user_id IS NULL)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_by_email_for_linking(text) TO authenticated;

