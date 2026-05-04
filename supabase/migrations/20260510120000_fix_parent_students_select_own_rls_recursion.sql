-- Fix 42P17: infinite recursion detected in policy for relation "parent_students".
--
-- Cause (regression):
--   Migration 20260502153000 recreated `parent_students_select_own` using
--   EXISTS (SELECT ... FROM parent_profiles ...), which runs parent_profiles RLS.
--   Policies `parent_profiles_select_org_admin` / `parent_profiles_select_tutor`
--   subquery `parent_students` again → infinite recursion.
--
-- Fix:
--   Use existing SECURITY DEFINER helper `get_my_parent_profile_id()` (row_security off)
--   so evaluating parent_students does not re-enter parent_profiles RLS.
--
-- Data: unchanged — only policy text; sessions/students rows are not deleted.

DROP POLICY IF EXISTS "parent_students_select_own" ON public.parent_students;
CREATE POLICY "parent_students_select_own" ON public.parent_students
  FOR SELECT USING (parent_id = public.get_my_parent_profile_id());
