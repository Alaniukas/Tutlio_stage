-- Email is a contact, not permission to pick the first child in a family.
CREATE OR REPLACE FUNCTION public.get_student_by_email_for_linking(p_email text)
RETURNS TABLE (id uuid, linked_user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
    OR nullif(trim(p_email), '') IS NULL
    OR lower(trim(p_email)) IS DISTINCT FROM lower(trim(auth.jwt()->>'email'))
    OR EXISTS (SELECT 1 FROM public.parent_profiles p WHERE p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.organization_admins a WHERE a.user_id = auth.uid())
  THEN RETURN; END IF;

  RETURN QUERY
  SELECT matched.id, matched.linked_user_id
  FROM (
    SELECT s.id, s.linked_user_id, s.full_name, s.detached_at, count(*) OVER () AS matches
    FROM public.students s
    WHERE lower(trim(s.email)) = lower(trim(p_email))
  ) matched
  WHERE matched.matches = 1
    AND matched.detached_at IS NULL
    AND (matched.linked_user_id IS NULL OR matched.linked_user_id = auth.uid())
    AND nullif(trim(matched.full_name), '') IS NOT NULL
    AND lower(trim(matched.full_name)) <> 'laukiama registracijos';
END;
$$;
REVOKE ALL ON FUNCTION public.get_student_by_email_for_linking(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_by_email_for_linking(text) TO authenticated;
