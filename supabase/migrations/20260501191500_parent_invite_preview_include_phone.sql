-- Expose parent phone (from students.payer_phone) in invite preview RPC (token-based only).
-- `parent_invites.code` is added in 20260502120000; do not reference it here (migration order).

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

GRANT EXECUTE ON FUNCTION public.get_parent_invite_preview(text) TO anon, authenticated;
