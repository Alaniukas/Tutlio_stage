-- Serialize additions for the same parent and insert the child/link together.
-- A failed request must not leave an invisible child that is duplicated on retry.
CREATE OR REPLACE FUNCTION public.add_parent_child_once(
  p_parent_id uuid, p_template_id uuid, p_full_name text, p_email text, p_invite_code text
) RETURNS TABLE(student_id uuid, created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  parent_row public.parent_profiles%ROWTYPE;
  template_row public.students%ROWTYPE;
  existing_id uuid;
  new_id uuid;
  org_id uuid;
BEGIN
  SELECT * INTO parent_row FROM public.parent_profiles WHERE id = p_parent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parent not found'; END IF;
  SELECT s.* INTO template_row FROM public.students s
    JOIN public.parent_students ps ON ps.student_id = s.id
    WHERE ps.parent_id = p_parent_id AND s.id = p_template_id AND s.detached_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active child not found'; END IF;
  org_id := template_row.organization_id;
  IF org_id IS NULL THEN SELECT organization_id INTO org_id FROM public.profiles WHERE id = template_row.tutor_id; END IF;
  IF org_id IS NULL THEN RAISE EXCEPTION 'Missing organization'; END IF;
  IF nullif(trim(p_full_name), '') IS NULL THEN RAISE EXCEPTION 'Child name required'; END IF;
  SELECT s.id INTO existing_id FROM public.students s
    JOIN public.parent_students ps ON ps.student_id = s.id
    WHERE ps.parent_id = p_parent_id AND s.detached_at IS NULL
      AND coalesce(s.organization_id,(SELECT organization_id FROM public.profiles WHERE id=s.tutor_id)) = org_id
      AND lower(regexp_replace(trim(normalize(s.full_name, NFC)), '\s+', ' ', 'g'))
        = lower(regexp_replace(trim(normalize(p_full_name, NFC)), '\s+', ' ', 'g'))
    LIMIT 1;
  IF existing_id IS NOT NULL THEN RETURN QUERY SELECT existing_id, false; RETURN; END IF;
  INSERT INTO public.students(full_name,email,organization_id,tutor_id,invite_code,payment_payer,payer_name,payer_email,enrollment_status)
    VALUES(trim(p_full_name),nullif(trim(p_email),''),org_id,template_row.tutor_id,p_invite_code,
      'parent',coalesce(parent_row.full_name,template_row.payer_name),coalesce(parent_row.email,template_row.payer_email),'active')
    RETURNING id INTO new_id;
  INSERT INTO public.parent_students(parent_id,student_id) VALUES(p_parent_id,new_id);
  RETURN QUERY SELECT new_id,true;
END;
$$;
REVOKE ALL ON FUNCTION public.add_parent_child_once(uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_parent_child_once(uuid,uuid,text,text,text) TO service_role;
