-- Fix "infinite recursion detected in policy" between:
-- - parent_profiles policies that reference parent_students
-- - parent_students_select_own policy that referenced parent_profiles
--
-- Approach: use SECURITY DEFINER helper to resolve current user's parent_profile id
-- without invoking RLS on parent_profiles, then reference that in parent_students policy.

CREATE OR REPLACE FUNCTION public.get_my_parent_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT pp.id
  FROM public.parent_profiles pp
  WHERE pp.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_parent_profile_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_parent_profile_id() TO authenticated, service_role;

-- Replace parent_students_select_own policy to avoid referencing parent_profiles.
DROP POLICY IF EXISTS "parent_students_select_own" ON public.parent_students;
CREATE POLICY "parent_students_select_own" ON public.parent_students
  FOR SELECT USING (parent_id = public.get_my_parent_profile_id());

