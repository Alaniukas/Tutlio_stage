-- Fix infinite recursion in profiles SELECT policies.
-- The prior policies queried RLS-protected tables (students / organization_admins)
-- directly inside USING clauses, which can recurse back into profiles.
-- Move these checks into SECURITY DEFINER helper functions.

CREATE OR REPLACE FUNCTION public.can_read_profile_as_org_admin(p_profile_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_profile_org_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_admins oa
      WHERE oa.user_id = auth.uid()
        AND oa.organization_id = p_profile_org_id
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_profile_as_linked_student(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.linked_user_id = auth.uid()
      AND s.tutor_id = p_profile_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_profile_as_parent(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.parent_profiles pp
    JOIN public.parent_students ps ON ps.parent_id = pp.id
    JOIN public.students s ON s.id = ps.student_id
    WHERE pp.user_id = auth.uid()
      AND s.tutor_id = p_profile_id
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_profile_as_org_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_profile_as_linked_student(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_profile_as_parent(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_read_profile_as_org_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_profile_as_linked_student(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_profile_as_parent(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_select_org_colleague" ON public.profiles;
CREATE POLICY "profiles_select_org_colleague" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.can_read_profile_as_org_admin(organization_id));

DROP POLICY IF EXISTS "profiles_select_tutor_of_linked_student" ON public.profiles;
CREATE POLICY "profiles_select_tutor_of_linked_student" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.can_read_profile_as_linked_student(id));

DROP POLICY IF EXISTS "profiles_select_parent_tutor" ON public.profiles;
CREATE POLICY "profiles_select_parent_tutor" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.can_read_profile_as_parent(id));
