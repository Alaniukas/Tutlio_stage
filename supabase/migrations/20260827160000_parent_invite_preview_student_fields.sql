DROP FUNCTION IF EXISTS public.get_parent_invite_preview(text);
DROP FUNCTION IF EXISTS public.get_parent_invite_preview_by_code(text, text);

CREATE FUNCTION public.get_parent_invite_preview(p_token text)
RETURNS TABLE (
  token text,
  parent_email text,
  parent_name text,
  parent_phone text,
  student_full_name text,
  student_grade text,
  student_birth_date date,
  used boolean,
  organization_id uuid
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
    s.grade AS student_grade,
    s.child_birth_date AS student_birth_date,
    pi.used,
    coalesce(s.organization_id, tutor.organization_id) AS organization_id
  FROM public.parent_invites pi
  LEFT JOIN public.students s ON s.id = pi.student_id
  LEFT JOIN public.profiles tutor ON tutor.id = s.tutor_id
  WHERE pi.token = trim(p_token)
     OR upper(trim(pi.code)) = upper(trim(p_token))
  ORDER BY pi.created_at DESC
  LIMIT 1;
$$;

CREATE FUNCTION public.get_parent_invite_preview_by_code(p_code text, p_email text)
RETURNS TABLE (
  token text,
  parent_email text,
  parent_name text,
  parent_phone text,
  student_full_name text,
  student_grade text,
  student_birth_date date,
  used boolean,
  organization_id uuid
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
    s.grade AS student_grade,
    s.child_birth_date AS student_birth_date,
    pi.used,
    coalesce(s.organization_id, tutor.organization_id) AS organization_id
  FROM public.parent_invites pi
  LEFT JOIN public.students s ON s.id = pi.student_id
  LEFT JOIN public.profiles tutor ON tutor.id = s.tutor_id
  WHERE upper(trim(pi.code)) = upper(trim(p_code))
    AND lower(trim(pi.parent_email)) = lower(trim(p_email))
  ORDER BY pi.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_parent_invite_preview(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_parent_invite_preview_by_code(text, text) TO anon, authenticated;
