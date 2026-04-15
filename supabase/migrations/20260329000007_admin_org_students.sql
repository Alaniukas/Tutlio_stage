-- Mokinių sąrašas /admin įmonės detalėms (ta pati logika kaip admin_org_student_count)
CREATE OR REPLACE FUNCTION public.admin_org_students(p_org_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  tutor_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT s.id, s.full_name, s.email, s.tutor_id
  FROM public.students s
  WHERE
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = s.tutor_id AND p.organization_id = p_org_id
    )
    OR EXISTS (
      SELECT 1 FROM public.organization_admins oa
      WHERE oa.user_id = s.tutor_id AND oa.organization_id = p_org_id
    )
    OR EXISTS (
      SELECT 1 FROM public.tutor_invites ti
      WHERE ti.used_by_profile_id = s.tutor_id AND ti.organization_id = p_org_id
    )
    OR (s.organization_id IS NOT NULL AND s.organization_id = p_org_id);
$$;

REVOKE ALL ON FUNCTION public.admin_org_students(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_org_students(uuid) TO service_role;

COMMENT ON FUNCTION public.admin_org_students(uuid) IS
  'Platform admin panel: mokinių sąrašas pagal org (ta pati WHERE kaip admin_org_student_count).';
