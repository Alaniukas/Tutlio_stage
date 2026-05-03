-- Tutor messageable parents: returns parents (parent_profiles.user_id) for every student
-- the calling tutor (auth.uid()) currently teaches. SECURITY DEFINER + row_security off
-- to avoid RLS recursion across parent_profiles / parent_students / students.

CREATE OR REPLACE FUNCTION public.get_tutor_messageable_parents()
RETURNS TABLE(user_id uuid, full_name text, email text, student_id uuid, student_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT DISTINCT
    pp.user_id,
    COALESCE(NULLIF(pp.full_name, ''), '') AS full_name,
    COALESCE(NULLIF(pp.email, ''), '') AS email,
    s.id AS student_id,
    COALESCE(s.full_name, '') AS student_name
  FROM public.students s
  JOIN public.parent_students ps ON ps.student_id = s.id
  JOIN public.parent_profiles pp ON pp.id = ps.parent_id
  WHERE s.tutor_id = auth.uid()
    AND pp.user_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_tutor_messageable_parents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tutor_messageable_parents() TO authenticated, service_role;
