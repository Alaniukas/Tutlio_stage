-- Honor administrator / accountant role presets in RLS permission gate
-- (matches src/lib/orgAdminPermissions.ts resolveOrgAdminPermissions).

CREATE OR REPLACE FUNCTION private.org_admin_role_grants_permission(
  p_role text,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_role = 'owner' THEN true
    WHEN p_role = 'admin' THEN p_permission IN (
      'dashboard.view',
      'tutors.view', 'tutors.edit',
      'students.view', 'students.edit',
      'sessions.view', 'sessions.edit',
      'messages.view', 'messages.edit',
      'stats.view',
      'finance.view', 'finance.edit',
      'contracts.view', 'contracts.edit',
      'settings.view', 'settings.edit'
    )
    WHEN p_role = 'accountant' THEN p_permission IN (
      'finance.view', 'finance.totals', 'finance.edit'
    )
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION private.org_admin_role_grants_permission(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.org_admin_role_grants_permission(text, text) TO authenticated, service_role;

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
               OR private.org_admin_role_grants_permission(membership.role, requested.permission_key)
          )
        )
    )
  END;
$$;
