-- Service-role lookup of auth.users by email. listUsers pagination misses
-- existing parents (GoTrue often returns < requested per_page, so callers
-- stopped after the first page).
CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id
  FROM auth.users
  WHERE lower(email) = lower(btrim(p_email))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(text)
  TO service_role;
