-- Hotfix: prevent login-time hangs caused by recursive org admin RLS checks.
-- Symptom: organization_admins/profile reads can hang (HTTP 521/520 cascades).

CREATE OR REPLACE FUNCTION public.is_org_admin_member(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
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

-- Keep organization_admins SELECT policy minimal and non-recursive.
DROP POLICY IF EXISTS "Org admin reads co-admins same org" ON public.organization_admins;
DROP POLICY IF EXISTS "Org admin reads own row" ON public.organization_admins;
CREATE POLICY "Org admin reads own row" ON public.organization_admins
  FOR SELECT
  USING (user_id = auth.uid());
