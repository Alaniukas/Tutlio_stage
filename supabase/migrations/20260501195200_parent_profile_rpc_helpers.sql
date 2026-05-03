-- Parent profile helpers for frontend:
-- Avoid direct SELECTs on parent_profiles in the client (can be impacted by policy recursion).

CREATE OR REPLACE FUNCTION public.get_parent_profile_by_user_id(p_user_id uuid)
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT pp.id, pp.full_name
  FROM public.parent_profiles pp
  WHERE pp.user_id = p_user_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_parent_profile_by_user_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_parent_profile_by_user_id(uuid) TO authenticated, service_role;

