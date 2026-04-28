-- Fix infinite recursion in organization_admins SELECT policy.
-- The previous policy queried organization_admins inside its own USING clause.

CREATE OR REPLACE FUNCTION public.is_org_admin_member(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_admins oa
    WHERE oa.user_id = p_user_id
      AND oa.organization_id = p_org_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_admin_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_admin_member(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Org admin reads co-admins same org" ON public.organization_admins;
CREATE POLICY "Org admin reads co-admins same org" ON public.organization_admins
  FOR SELECT
  USING (
    public.is_org_admin_member(auth.uid(), organization_id)
  );

