-- Vienas patikimas mokinių skaičius platformos /admin API (service_role)
CREATE OR REPLACE FUNCTION public.admin_org_student_count(p_org_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
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

REVOKE ALL ON FUNCTION public.admin_org_student_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_org_student_count(uuid) TO service_role;

COMMENT ON FUNCTION public.admin_org_student_count(uuid) IS
  'Platform admin panel: mokinių skaičius pagal org (tutor profilis, org admin, kvietimas, students.organization_id).';
