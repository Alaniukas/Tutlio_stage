-- Tutor chat picker: list org admins of the tutor's organization.
-- Tutors typically lack RLS access to organization_admins outside their own row,
-- so we expose a SECURITY DEFINER helper.

CREATE OR REPLACE FUNCTION public.get_tutor_messageable_admins()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  WITH my_org AS (
    SELECT p.organization_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.organization_id IS NOT NULL
  )
  SELECT DISTINCT ON (oa.user_id)
         pp.id   AS user_id,
         pp.full_name,
         pp.email
  FROM my_org mo
  JOIN public.organization_admins oa ON oa.organization_id = mo.organization_id
  JOIN public.profiles pp ON pp.id = oa.user_id
  WHERE oa.user_id <> auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_tutor_messageable_admins() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tutor_messageable_admins() TO authenticated, service_role;
