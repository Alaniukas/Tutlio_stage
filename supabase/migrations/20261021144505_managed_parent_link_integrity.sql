-- The service workflow has already verified the selected family. Keep the
-- primary pointer, portal link and optional shared login in one transaction.
CREATE OR REPLACE FUNCTION public.link_managed_parent_students(
  p_parent_profile_id uuid,
  p_student_ids uuid[],
  p_allow_shared_login boolean DEFAULT true
)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  parent public.parent_profiles%ROWTYPE;
  first_student public.students%ROWTYPE;
  ids uuid[];
  child_name text;
BEGIN
  SELECT array_agg(DISTINCT student_id ORDER BY student_id) INTO ids
  FROM unnest(p_student_ids) AS student_id;
  IF COALESCE(cardinality(ids),0)=0 OR cardinality(ids)>100 OR array_position(ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid managed family student selection';
  END IF;
  SELECT * INTO STRICT parent FROM public.parent_profiles
  WHERE id=p_parent_profile_id FOR SHARE;
  IF parent.user_id IS NULL OR NULLIF(trim(parent.email),'') IS NULL THEN
    RAISE EXCEPTION 'Managed parent profile is incomplete';
  END IF;

  PERFORM id FROM public.students WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
  SELECT * INTO STRICT first_student FROM public.students WHERE id=ids[1];
  child_name := lower(regexp_replace(trim(first_student.full_name),'\s+',' ','g'));
  IF first_student.organization_id IS NULL OR COALESCE(child_name,'')='' OR
    (SELECT count(*) FROM public.students WHERE id=ANY(ids))<>cardinality(ids) OR EXISTS (
      SELECT 1 FROM public.students s WHERE s.id=ANY(ids) AND (
        s.organization_id IS DISTINCT FROM first_student.organization_id
        OR lower(regexp_replace(trim(s.full_name),'\s+',' ','g')) IS DISTINCT FROM child_name
        OR s.detached_at IS NOT NULL
        OR (s.parent_user_id IS NOT NULL AND s.parent_user_id<>parent.user_id)
      )
    ) OR (SELECT count(DISTINCT linked_user_id) FROM public.students WHERE id=ANY(ids))>1
  THEN
    RAISE EXCEPTION 'Managed family student selection changed or conflicts with an existing account';
  END IF;

  IF p_allow_shared_login AND EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.id=first_student.organization_id
      AND (o.features->'school_family_portal'='true'::jsonb
        OR o.features->'school_family_accounts_setup'='true'::jsonb)
  ) THEN
    RAISE EXCEPTION 'Verified school accounts require separate child and parent identities';
  END IF;

  INSERT INTO public.parent_students(parent_id,student_id)
  SELECT parent.id,student_id FROM unnest(ids) AS student_id
  ON CONFLICT(parent_id,student_id) DO NOTHING;

  UPDATE public.students s SET parent_user_id=parent.user_id,
    linked_user_id=CASE
      WHEN p_allow_shared_login AND s.linked_user_id IS NULL
        AND lower(trim(s.email))=lower(trim(parent.email)) THEN parent.user_id
      ELSE s.linked_user_id END
  WHERE s.id=ANY(ids);
END;
$$;

REVOKE ALL ON FUNCTION public.link_managed_parent_students(uuid,uuid[],boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.link_managed_parent_students(uuid,uuid[],boolean) TO service_role;
