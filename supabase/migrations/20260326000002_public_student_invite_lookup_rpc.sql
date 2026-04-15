-- Public-safe invite code lookup for login/onboarding flow.
-- We avoid granting anon SELECT on the whole students table.

DROP FUNCTION IF EXISTS public.get_student_by_invite_code(text);

CREATE OR REPLACE FUNCTION public.get_student_by_invite_code(p_invite_code text)
RETURNS TABLE(id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.students s
  WHERE upper(s.invite_code) = upper(p_invite_code)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_student_by_invite_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_by_invite_code(text) TO anon, authenticated, service_role;
