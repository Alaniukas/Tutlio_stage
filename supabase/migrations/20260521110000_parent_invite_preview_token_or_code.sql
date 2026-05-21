-- Parent invite preview: match URL ?token= by UUID token OR legacy 8-char code.
-- Restores payer_phone in preview (dropped in 20260502120000).

DROP FUNCTION IF EXISTS public.get_parent_invite_preview(text);

CREATE OR REPLACE FUNCTION public.get_parent_invite_preview(p_token text)
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
  WHERE pi.token = trim(p_token)
     OR upper(trim(pi.code)) = upper(trim(p_token))
  ORDER BY pi.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_parent_invite_preview(text) TO anon, authenticated;
