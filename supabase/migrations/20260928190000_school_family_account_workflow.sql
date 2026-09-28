-- Opt-in school family access. Existing contacts and Auth accounts are not changed.
CREATE TABLE public.school_family_guardians (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  annual_contract_id uuid NOT NULL REFERENCES public.school_contracts(id) ON DELETE CASCADE,
  guardian_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  guardian_name text NOT NULL CHECK (length(trim(guardian_name)) > 0),
  guardian_email text NOT NULL CHECK (guardian_email = lower(trim(guardian_email)) AND position('@' IN guardian_email) > 1),
  identity_hash text NOT NULL CHECK (length(identity_hash) = 64),
  evidence_source text NOT NULL CHECK (evidence_source IN ('signed_primary', 'admin_verified')),
  signature_id uuid REFERENCES public.school_contract_signatures(id) ON DELETE SET NULL,
  signature_personal_code_hash text CHECK(signature_personal_code_hash IS NULL OR length(signature_personal_code_hash)=64),
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, student_id)
);
CREATE INDEX school_family_guardians_identity ON public.school_family_guardians(organization_id, identity_hash);
CREATE INDEX school_family_guardians_user ON public.school_family_guardians(organization_id, guardian_user_id);

CREATE TABLE public.school_family_accounts (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('parent', 'student')),
  created_at timestamptz NOT NULL DEFAULT now(),
  invited_at timestamptz,
  activated_at timestamptz,
  first_login_at timestamptz,
  PRIMARY KEY (organization_id, user_id, role)
);

CREATE TABLE public.school_family_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('parent', 'student')),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_at timestamptz NOT NULL,
  sent_at timestamptz,
  redeemed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, role)
);

CREATE TABLE public.school_family_workflow_locks (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id, student_id)
);

CREATE TABLE public.school_family_identity_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  annual_contract_id uuid NOT NULL REFERENCES public.school_contracts(id),
  parent_user_id uuid NOT NULL REFERENCES auth.users(id),
  previous_student_user_id uuid NOT NULL REFERENCES auth.users(id),
  new_student_user_id uuid NOT NULL REFERENCES auth.users(id),
  reviewed_by uuid NOT NULL REFERENCES auth.users(id),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  CHECK(parent_user_id=previous_student_user_id AND parent_user_id<>new_student_user_id)
);

ALTER TABLE public.school_family_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_family_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_family_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_family_workflow_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_family_identity_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_family_guardians, public.school_family_accounts, public.school_family_invitations, public.school_family_workflow_locks FROM anon, authenticated;
GRANT ALL ON public.school_family_guardians, public.school_family_accounts, public.school_family_invitations, public.school_family_workflow_locks TO service_role;
REVOKE ALL ON public.school_family_identity_reviews FROM anon,authenticated;
GRANT ALL ON public.school_family_identity_reviews TO service_role;

CREATE OR REPLACE FUNCTION public.school_family_guardian_row_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.school_contracts c JOIN public.students s ON s.id = c.student_id
    WHERE c.id = NEW.annual_contract_id AND c.student_id = NEW.student_id
      AND c.organization_id = NEW.organization_id AND s.organization_id = NEW.organization_id
      AND c.kind = 'annual' AND c.signing_status = 'signed'
      AND c.archived_at IS NULL AND c.terminated_at IS NULL
  ) THEN RAISE EXCEPTION 'school_family_invalid_annual_contract'; END IF;
  IF NEW.guardian_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.students s WHERE s.organization_id = NEW.organization_id
      AND s.linked_user_id = NEW.guardian_user_id
  ) THEN RAISE EXCEPTION 'school_family_shared_identity_review'; END IF;
  IF NEW.evidence_source = 'signed_primary' AND NOT EXISTS (
    SELECT 1 FROM public.school_contract_signatures sig
    WHERE sig.id = NEW.signature_id AND sig.contract_id = NEW.annual_contract_id
      AND sig.role = 'parent_primary' AND sig.status = 'signed'
      AND lower(trim(sig.signer_email)) = NEW.guardian_email
      AND lower(regexp_replace(trim(sig.signer_name),'\s+',' ','g'))=lower(regexp_replace(trim(NEW.guardian_name),'\s+',' ','g'))
      AND encode(sha256(convert_to(regexp_replace(trim(sig.signer_personal_code),'\s+','','g'),'UTF8')),'hex')=NEW.signature_personal_code_hash
  ) THEN RAISE EXCEPTION 'school_family_invalid_signature'; END IF;
  IF NEW.evidence_source = 'admin_verified' AND NEW.verified_by IS NULL THEN
    RAISE EXCEPTION 'school_family_guardian_verifier_required';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER school_family_guardian_row_guard BEFORE INSERT OR UPDATE ON public.school_family_guardians
FOR EACH ROW EXECUTE FUNCTION public.school_family_guardian_row_guard();

-- RLS helper deliberately accepts no arbitrary user id. It always checks the caller.
CREATE OR REPLACE FUNCTION public.school_family_is_guardian(p_organization_id uuid, p_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.students child
      WHERE child.organization_id = p_organization_id AND child.linked_user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.school_family_guardians g
      JOIN public.students s ON s.id = g.student_id
      JOIN public.school_contracts c ON c.id = g.annual_contract_id
      JOIN public.organizations o ON o.id = g.organization_id
      WHERE g.organization_id = p_organization_id AND g.student_id = p_student_id
        AND g.guardian_user_id = auth.uid() AND s.organization_id = p_organization_id
        AND c.organization_id = p_organization_id AND c.student_id = p_student_id
        AND c.kind = 'annual' AND c.signing_status = 'signed'
        AND c.archived_at IS NULL AND c.terminated_at IS NULL
        AND o.entity_type = 'school' AND o.features->'school_family_portal' = 'true'::jsonb
        AND ((g.evidence_source = 'admin_verified' AND NOT EXISTS (
          SELECT 1 FROM public.school_contract_signatures signed_primary WHERE signed_primary.contract_id=c.id
            AND signed_primary.role='parent_primary' AND signed_primary.status='signed'
        )) OR EXISTS (
          SELECT 1 FROM public.school_contract_signatures sig WHERE sig.id = g.signature_id
            AND sig.contract_id = c.id AND sig.role = 'parent_primary' AND sig.status = 'signed'
            AND lower(trim(sig.signer_email)) = g.guardian_email
            AND lower(regexp_replace(trim(sig.signer_name),'\s+',' ','g'))=lower(regexp_replace(trim(g.guardian_name),'\s+',' ','g'))
            AND encode(sha256(convert_to(regexp_replace(trim(sig.signer_personal_code),'\s+','','g'),'UTF8')),'hex')=g.signature_personal_code_hash
        ))
    );
$$;
REVOKE ALL ON FUNCTION public.school_family_is_guardian(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_family_is_guardian(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.school_family_claim_workflow(p_organization_id uuid, p_student_id uuid, p_owner_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH claimed AS (
    INSERT INTO public.school_family_workflow_locks(organization_id,student_id,owner_id,expires_at)
    VALUES(p_organization_id,p_student_id,p_owner_id,now()+interval '3 minutes')
    ON CONFLICT(organization_id,student_id) DO UPDATE
      SET owner_id=EXCLUDED.owner_id,expires_at=EXCLUDED.expires_at
      WHERE school_family_workflow_locks.expires_at < now()
    RETURNING 1
  ) SELECT EXISTS(SELECT 1 FROM claimed);
$$;
REVOKE ALL ON FUNCTION public.school_family_claim_workflow(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.school_family_claim_workflow(uuid,uuid,uuid) TO service_role;

COMMENT ON TABLE public.school_family_guardians IS 'Annual-contract guardian evidence and explicit Auth binding. No migration backfill from mutable student contact emails.';
COMMENT ON TABLE public.school_family_invitations IS 'One-use, hashed password-setup tokens. Reinviting does not change any account password.';

-- Existing parent portals inherit the stricter rule only for opted-in schools.
CREATE OR REPLACE FUNCTION public.parent_can_access_student(p_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.students s JOIN public.organizations o ON o.id = s.organization_id
    WHERE s.id = p_student_id AND o.entity_type = 'school' AND o.features->'school_family_portal' = 'true'::jsonb
  ) THEN public.school_family_is_guardian((SELECT s.organization_id FROM public.students s WHERE s.id = p_student_id),p_student_id)
  ELSE EXISTS (SELECT 1 FROM public.parent_students ps JOIN public.parent_profiles pp ON pp.id=ps.parent_id
    WHERE ps.student_id=p_student_id AND pp.user_id=auth.uid())
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id=p_student_id AND s.parent_user_id=auth.uid()) END;
$$;
REVOKE ALL ON FUNCTION public.parent_can_access_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parent_can_access_student(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.school_family_student_scope_allowed(p_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.students s JOIN public.organizations o ON o.id=s.organization_id
    WHERE s.id=p_student_id AND o.entity_type='school' AND o.features->'school_family_portal'='true'::jsonb)
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id=p_student_id AND s.linked_user_id=auth.uid())
    OR public.parent_can_access_student(p_student_id)
    OR public.tutor_can_access_student(p_student_id)
    OR public.org_admin_can_access_student(p_student_id);
$$;
REVOKE ALL ON FUNCTION public.school_family_student_scope_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_family_student_scope_allowed(uuid) TO authenticated, service_role;

-- Restrictive policies intersect any historical permissive contact-based policy.
CREATE POLICY school_family_student_read_scope ON public.students AS RESTRICTIVE FOR SELECT TO authenticated
  USING(public.school_family_student_scope_allowed(id));
CREATE POLICY school_family_parent_link_scope ON public.parent_students AS RESTRICTIVE FOR ALL TO authenticated
  USING(public.school_family_student_scope_allowed(student_id))
  WITH CHECK(public.school_family_student_scope_allowed(student_id));
CREATE POLICY school_family_session_read_scope ON public.sessions AS RESTRICTIVE FOR SELECT TO authenticated
  USING(public.school_family_student_scope_allowed(student_id));
CREATE POLICY school_family_contract_read_scope ON public.school_contracts AS RESTRICTIVE FOR SELECT TO authenticated
  USING(student_id IS NULL OR public.school_family_student_scope_allowed(student_id));

CREATE OR REPLACE FUNCTION public.get_parent_child_ids(p_user_id uuid)
RETURNS TABLE(student_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public SET row_security=off AS $$
  SELECT s.id FROM public.students s WHERE auth.uid()=p_user_id AND public.parent_can_access_student(s.id) ORDER BY s.id;
$$;
REVOKE ALL ON FUNCTION public.get_parent_child_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_parent_child_ids(uuid) TO authenticated, service_role;

-- A matching contact address cannot self-claim an opted-in school child.
CREATE OR REPLACE FUNCTION public.get_student_by_email_for_linking(p_email text)
RETURNS TABLE(id uuid,linked_user_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR nullif(trim(p_email),'') IS NULL
    OR lower(trim(p_email)) IS DISTINCT FROM lower(trim(auth.jwt()->>'email'))
    OR EXISTS(SELECT 1 FROM public.parent_profiles p WHERE p.user_id=auth.uid())
    OR EXISTS(SELECT 1 FROM public.organization_admins a WHERE a.user_id=auth.uid()) THEN RETURN; END IF;
  RETURN QUERY SELECT matched.id,matched.linked_user_id FROM (
    SELECT s.id,s.linked_user_id,s.full_name,s.detached_at,s.organization_id,count(*) OVER() AS matches
    FROM public.students s WHERE lower(trim(s.email))=lower(trim(p_email))
  ) matched WHERE matched.matches=1 AND matched.detached_at IS NULL
    AND (matched.linked_user_id IS NULL OR matched.linked_user_id=auth.uid())
    AND nullif(trim(matched.full_name),'') IS NOT NULL
    AND lower(trim(matched.full_name))<>'laukiama registracijos'
    AND NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=matched.organization_id
      AND o.entity_type='school' AND o.features->'school_family_portal'='true'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.get_student_by_email_for_linking(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_student_by_email_for_linking(text) TO authenticated;
