-- Linked student portal: registered parents list (also callable from API with verified user id + service role).

CREATE OR REPLACE FUNCTION public.get_registered_parents_for_linked_student(
  p_student_id uuid,
  p_linked_user_id uuid
)
RETURNS TABLE (full_name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pp.full_name::text, pp.email::text
  FROM public.parent_students ps
  INNER JOIN public.parent_profiles pp ON pp.id = ps.parent_id
  INNER JOIN public.students s ON s.id = ps.student_id
  WHERE ps.student_id = p_student_id
    AND pp.user_id IS NOT NULL
    AND s.linked_user_id = p_linked_user_id;
$$;

REVOKE ALL ON FUNCTION public.get_registered_parents_for_linked_student(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_registered_parents_for_linked_student(uuid, uuid) TO authenticated, service_role;
