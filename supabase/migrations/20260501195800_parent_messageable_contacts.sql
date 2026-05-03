-- Parent messaging contacts:
-- Parent should be able to message:
-- - the tutor(s) of their linked student(s)
-- - the organization admin(s) of those tutor organizations (if any)

CREATE OR REPLACE FUNCTION public.get_parent_messageable_contacts()
RETURNS TABLE(user_id uuid, full_name text, email text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  WITH me_parent AS (
    SELECT public.get_my_parent_profile_id() AS parent_id
  ),
  linked AS (
    SELECT s.id AS student_id, s.tutor_id, p.organization_id
    FROM public.parent_students ps
    JOIN public.students s ON s.id = ps.student_id
    LEFT JOIN public.profiles p ON p.id = s.tutor_id
    JOIN me_parent mp ON mp.parent_id = ps.parent_id
  ),
  tutors AS (
    SELECT DISTINCT l.tutor_id AS user_id, 'tutor'::text AS role
    FROM linked l
    WHERE l.tutor_id IS NOT NULL
  ),
  admins AS (
    SELECT DISTINCT oa.user_id AS user_id, 'org_admin'::text AS role
    FROM linked l
    JOIN public.organization_admins oa ON oa.organization_id = l.organization_id
    WHERE l.organization_id IS NOT NULL
  ),
  people AS (
    SELECT * FROM tutors
    UNION
    SELECT * FROM admins
  )
  SELECT p.user_id, COALESCE(pr.full_name, '') AS full_name, COALESCE(pr.email, '') AS email, p.role
  FROM people p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE pr.id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_parent_messageable_contacts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_parent_messageable_contacts() TO authenticated, service_role;

