CREATE OR REPLACE FUNCTION private.org_admin_permission_gate(p_required text[] DEFAULT ARRAY[]::text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT CASE
    WHEN (SELECT auth.uid()) IS NULL THEN false
    WHEN EXISTS (
      SELECT 1
      FROM private.revoked_org_admin_users revoked
      WHERE revoked.user_id = (SELECT auth.uid())
    ) THEN false
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.organization_admins membership
      WHERE membership.user_id = (SELECT auth.uid())
    ) THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.organization_admins membership
      WHERE membership.user_id = (SELECT auth.uid())
        AND membership.status = 'active'
        AND (
          membership.role = 'owner'
          OR cardinality(p_required) = 0
          OR EXISTS (
            SELECT 1
            FROM unnest(p_required) AS requested(permission_key)
            WHERE membership.permissions @> jsonb_build_object(requested.permission_key, true)
          )
        )
    )
  END;
$$;

DROP FUNCTION IF EXISTS private.org_admin_role_grants_permission(text, text);;
