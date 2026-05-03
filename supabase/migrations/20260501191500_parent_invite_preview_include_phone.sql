-- Expose parent phone (from students.payer_phone) in invite preview RPCs.
-- Used only for prefilled, read-only display on parent registration page.

DROP FUNCTION IF EXISTS public.get_parent_invite_preview(text);
CREATE OR REPLACE FUNCTION public.get_parent_invite_preview(p_token text)
RETURNS TABLE (
  parent_email text,
  parent_name text,
  parent_phone text,
  student_full_name text,
  used boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pi.parent_email,
    pi.parent_name,
    s.payer_phone AS parent_phone,
    s.full_name AS student_full_name,
    pi.used
  FROM public.parent_invites pi
  LEFT JOIN public.students s ON s.id = pi.student_id
  WHERE pi.token = trim(p_token)
  LIMIT 1;
$$;

DROP FUNCTION IF EXISTS public.get_parent_invite_preview_by_code(text, text);
CREATE OR REPLACE FUNCTION public.get_parent_invite_preview_by_code(p_code text, p_email text)
RETURNS TABLE (
  token text,
  parent_email text,
  parent_name text,
  parent_phone text,
  student_full_name text,
  used boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pi.token,
    pi.parent_email,
    pi.parent_name,
    s.payer_phone AS parent_phone,
    s.full_name AS student_full_name,
    pi.used
  FROM public.parent_invites pi
  LEFT JOIN public.students s ON s.id = pi.student_id
  WHERE UPPER(TRIM(pi.code)) = UPPER(TRIM(p_code))
    AND lower(trim(pi.parent_email)) = lower(trim(p_email))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_parent_invite_preview(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_parent_invite_preview_by_code(text, text) TO anon, authenticated;

