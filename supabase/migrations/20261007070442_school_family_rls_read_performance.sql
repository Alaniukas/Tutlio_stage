-- Contract/signature/installment embeds repeatedly run these RLS helpers.
-- Keep the same access rules, but short-circuit staff access and reject callers
-- without a guardian binding before planning the signed-evidence joins.
CREATE OR REPLACE FUNCTION public.school_family_is_guardian(p_organization_id uuid, p_student_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
BEGIN
  IF caller_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.school_family_guardians g
    WHERE g.organization_id = p_organization_id
      AND g.student_id = p_student_id
      AND g.guardian_user_id = caller_id
  ) THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM public.students child
    WHERE child.organization_id = p_organization_id AND child.linked_user_id = caller_id
  ) AND EXISTS (
    SELECT 1 FROM public.school_family_guardians g
    JOIN public.students s ON s.id = g.student_id
    JOIN public.school_contracts c ON c.id = g.annual_contract_id
    JOIN public.organizations o ON o.id = g.organization_id
    WHERE g.organization_id = p_organization_id AND g.student_id = p_student_id
      AND g.guardian_user_id = caller_id AND s.organization_id = p_organization_id
      AND c.organization_id = p_organization_id AND c.student_id = p_student_id
      AND c.kind = 'annual' AND c.signing_status = 'signed'
      AND c.archived_at IS NULL AND c.terminated_at IS NULL
      AND o.entity_type = 'school' AND o.features->'school_family_portal' = 'true'::jsonb
      AND ((g.evidence_source = 'admin_verified' AND NOT EXISTS (
        SELECT 1 FROM public.school_contract_signatures signed_primary
        WHERE signed_primary.contract_id = c.id
          AND signed_primary.role = 'parent_primary' AND signed_primary.status = 'signed'
      )) OR EXISTS (
        SELECT 1 FROM public.school_contract_signatures sig
        WHERE sig.id = g.signature_id AND sig.contract_id = c.id
          AND sig.role = 'parent_primary' AND sig.status = 'signed'
          AND lower(trim(sig.signer_email)) = g.guardian_email
          AND lower(regexp_replace(trim(sig.signer_name),'\s+',' ','g')) = lower(regexp_replace(trim(g.guardian_name),'\s+',' ','g'))
          AND encode(sha256(convert_to(regexp_replace(trim(sig.signer_personal_code),'\s+','','g'),'UTF8')),'hex') = g.signature_personal_code_hash
      ))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.school_family_student_scope_allowed(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT CASE
    WHEN public.org_admin_can_access_student(p_student_id) THEN true
    WHEN NOT EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.organizations o ON o.id = s.organization_id
      WHERE s.id = p_student_id AND o.entity_type = 'school'
        AND o.features->'school_family_portal' = 'true'::jsonb
    ) THEN true
    WHEN EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = p_student_id AND s.linked_user_id = (SELECT auth.uid())
    ) THEN true
    WHEN public.tutor_can_access_student(p_student_id) THEN true
    WHEN (SELECT auth.uid()) IS NOT NULL
      AND public.tutor_can_view_student_via_school_links(p_student_id, (SELECT auth.uid())) THEN true
    ELSE public.parent_can_access_student(p_student_id)
  END;
$$;

REVOKE ALL ON FUNCTION public.school_family_is_guardian(uuid, uuid), public.school_family_student_scope_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_family_is_guardian(uuid, uuid), public.school_family_student_scope_allowed(uuid) TO authenticated, service_role;
