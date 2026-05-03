-- Parent login helper: avoid RLS recursion by using SECURITY DEFINER + row_security off
-- to check whether a parent profile exists for the given auth user id.

CREATE OR REPLACE FUNCTION public.get_parent_profile_id_by_user_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT pp.id
  FROM public.parent_profiles pp
  WHERE pp.user_id = p_user_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_parent_profile_id_by_user_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_parent_profile_id_by_user_id(uuid) TO authenticated, service_role;

