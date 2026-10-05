-- Availability saves were evaluating profiles -> organizations -> family RLS
-- for every tutor in the administrator's organization, exhausting the API timeout.
-- This private lookup checks the caller's own membership and feature flag once;
-- table permissions and the existing restrictive permission gates still apply.
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.org_admin_availability_tutor_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT p.id
  FROM public.organization_admins oa
  JOIN public.organizations o ON o.id = oa.organization_id
  JOIN public.profiles p ON p.organization_id = oa.organization_id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND oa.user_id = (SELECT auth.uid())
    AND oa.status = 'active'
    AND COALESCE((o.features->>'org_admin_calendar_full_control')::boolean, false);
$$;

REVOKE ALL ON FUNCTION private.org_admin_availability_tutor_ids() FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.org_admin_availability_tutor_ids() TO authenticated, service_role;

DROP POLICY IF EXISTS "Org admin can create org tutor availability" ON public.availability;
CREATE POLICY "Org admin can create org tutor availability" ON public.availability
  FOR INSERT TO authenticated
  WITH CHECK (
    tutor_id IN (SELECT private.org_admin_availability_tutor_ids())
    AND NOT (SELECT public.write_blocked_by_org_suspension())
  );

DROP POLICY IF EXISTS "Org admin can update org tutor availability" ON public.availability;
CREATE POLICY "Org admin can update org tutor availability" ON public.availability
  FOR UPDATE TO authenticated
  USING (
    tutor_id IN (SELECT private.org_admin_availability_tutor_ids())
    AND NOT (SELECT public.write_blocked_by_org_suspension())
  )
  WITH CHECK (
    tutor_id IN (SELECT private.org_admin_availability_tutor_ids())
    AND NOT (SELECT public.write_blocked_by_org_suspension())
  );

DROP POLICY IF EXISTS "Org admin can delete org tutor availability" ON public.availability;
CREATE POLICY "Org admin can delete org tutor availability" ON public.availability
  FOR DELETE TO authenticated
  USING (
    tutor_id IN (SELECT private.org_admin_availability_tutor_ids())
    AND NOT (SELECT public.write_blocked_by_org_suspension())
  );
