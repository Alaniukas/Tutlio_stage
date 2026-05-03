-- Org admin: list parents of students in their organization for chat picker.
--
-- Why this is needed:
-- The frontend used to fetch `parent_students` joined with `parent_profiles`,
-- but the existing `parent_profiles_select_org_admin` RLS policy requires the
-- student's tutor to also be in the admin's organization. When the student has
-- no tutor (or tutor is outside the org), the join returns NULL and parents
-- get silently filtered out — leaving the admin unable to message them.
--
-- This SECURITY DEFINER RPC bypasses that limitation safely: it only returns
-- parents for students that genuinely belong to the calling admin's org.

CREATE OR REPLACE FUNCTION public.get_org_admin_messageable_parents()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  student_id uuid,
  student_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  WITH my_orgs AS (
    SELECT oa.organization_id
    FROM public.organization_admins oa
    WHERE oa.user_id = auth.uid()
  )
  SELECT DISTINCT ON (pp.user_id, s.id)
    pp.user_id,
    pp.full_name,
    pp.email,
    s.id      AS student_id,
    s.full_name AS student_name
  FROM public.parent_students ps
  JOIN public.parent_profiles pp ON pp.id = ps.parent_id
  JOIN public.students s ON s.id = ps.student_id
  JOIN my_orgs mo ON mo.organization_id = s.organization_id
  WHERE pp.user_id IS NOT NULL
    AND pp.user_id <> auth.uid()
  ORDER BY pp.user_id, s.id, pp.full_name NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.get_org_admin_messageable_parents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_admin_messageable_parents() TO authenticated, service_role;
