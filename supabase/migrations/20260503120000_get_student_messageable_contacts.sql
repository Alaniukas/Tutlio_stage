-- Student chat picker: list everyone the calling student can message.
-- Includes: their tutor, org admins (if their tutor is in an org), and their parents.
--
-- The student account uses students.linked_user_id = auth.uid().
-- This RPC is SECURITY DEFINER so it bypasses RLS recursion edge cases.

CREATE OR REPLACE FUNCTION public.get_student_messageable_contacts()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  WITH my_students AS (
    SELECT s.id           AS student_id,
           s.tutor_id     AS tutor_id,
           s.organization_id AS student_org_id,
           p.organization_id AS tutor_org_id
    FROM public.students s
    LEFT JOIN public.profiles p ON p.id = s.tutor_id
    WHERE s.linked_user_id = auth.uid()
  )
  -- Tutor
  SELECT DISTINCT ON (pp.id)
         pp.id AS user_id,
         pp.full_name,
         pp.email,
         'tutor'::text AS role
  FROM my_students ms
  JOIN public.profiles pp ON pp.id = ms.tutor_id
  WHERE pp.id IS NOT NULL
    AND pp.id <> auth.uid()
  UNION ALL
  -- Org admins of the student's organization (or tutor's organization as fallback)
  SELECT DISTINCT ON (oa.user_id)
         pp.id AS user_id,
         pp.full_name,
         pp.email,
         'org_admin'::text
  FROM my_students ms
  JOIN public.organization_admins oa
    ON oa.organization_id = COALESCE(ms.student_org_id, ms.tutor_org_id)
  JOIN public.profiles pp ON pp.id = oa.user_id
  WHERE oa.user_id <> auth.uid()
  UNION ALL
  -- Parents linked to the student
  SELECT DISTINCT ON (pp.user_id)
         pp.user_id,
         pp.full_name,
         pp.email,
         'parent'::text
  FROM my_students ms
  JOIN public.parent_students ps ON ps.student_id = ms.student_id
  JOIN public.parent_profiles pp ON pp.id = ps.parent_id
  WHERE pp.user_id IS NOT NULL
    AND pp.user_id <> auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_student_messageable_contacts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_messageable_contacts() TO authenticated, service_role;
