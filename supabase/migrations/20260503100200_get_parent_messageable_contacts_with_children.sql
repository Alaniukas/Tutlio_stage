-- Extend the parent's messageable contact list to include their own (linked) children.
-- Children appear with role='student' and full_name from `students`. Only children that
-- have a linked auth user (`linked_user_id IS NOT NULL`) are returned, since chat targets
-- a user_id (auth.users) – children without a linked account cannot receive messages.

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
    SELECT s.id AS student_id, s.tutor_id, s.linked_user_id, s.full_name AS student_name, s.email AS student_email, p.organization_id
    FROM public.parent_students ps
    JOIN public.students s ON s.id = ps.student_id
    LEFT JOIN public.profiles p ON p.id = s.tutor_id
    JOIN me_parent mp ON mp.parent_id = ps.parent_id
  ),
  tutors AS (
    SELECT DISTINCT l.tutor_id AS user_id, NULL::text AS full_name, NULL::text AS email, 'tutor'::text AS role
    FROM linked l
    WHERE l.tutor_id IS NOT NULL
  ),
  admins AS (
    SELECT DISTINCT oa.user_id AS user_id, NULL::text AS full_name, NULL::text AS email, 'org_admin'::text AS role
    FROM linked l
    JOIN public.organization_admins oa ON oa.organization_id = l.organization_id
    WHERE l.organization_id IS NOT NULL
  ),
  children AS (
    SELECT DISTINCT ON (l.linked_user_id)
      l.linked_user_id AS user_id,
      l.student_name AS full_name,
      l.student_email AS email,
      'student'::text AS role
    FROM linked l
    WHERE l.linked_user_id IS NOT NULL
    ORDER BY l.linked_user_id
  )
  SELECT
    p.user_id,
    COALESCE(NULLIF(pr.full_name, ''), p.full_name, '') AS full_name,
    COALESCE(NULLIF(pr.email, ''), p.email, '') AS email,
    p.role
  FROM (
    SELECT * FROM tutors
    UNION
    SELECT * FROM admins
    UNION
    SELECT * FROM children
  ) p
  LEFT JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.user_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_parent_messageable_contacts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_parent_messageable_contacts() TO authenticated, service_role;
