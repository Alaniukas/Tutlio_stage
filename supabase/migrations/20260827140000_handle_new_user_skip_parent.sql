-- Parent signup uses auth.admin.createUser with user_metadata.role = parent.
-- handle_new_user previously inserted a tutor profiles row for every non-student,
-- which can fail or leave parents looking like tutors.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  meta_role text := lower(trim(coalesce(new.raw_user_meta_data->>'role', '')));
  meta_student_id text := trim(coalesce(new.raw_user_meta_data->>'student_id', ''));
  is_student_by_meta boolean := (meta_role = 'student' or meta_student_id <> '');
  student_id_to_link uuid;
  linked_count int;
  v_org_id uuid;
BEGIN
  IF meta_role = 'parent' THEN
    RETURN new;
  END IF;

  IF is_student_by_meta AND meta_student_id <> '' THEN
    UPDATE public.students
    SET
      linked_user_id = new.id,
      email = coalesce(new.email, new.raw_user_meta_data->>'email'),
      phone = coalesce(new.raw_user_meta_data->>'phone', phone),
      age = cast(nullif(new.raw_user_meta_data->>'age', '') as integer),
      grade = new.raw_user_meta_data->>'grade',
      subject_id = nullif(new.raw_user_meta_data->>'subject_id', '')::uuid,
      payment_payer = coalesce(new.raw_user_meta_data->>'payment_payer', 'self'),
      payer_name = new.raw_user_meta_data->>'payer_name',
      payer_email = new.raw_user_meta_data->>'payer_email',
      payer_phone = new.raw_user_meta_data->>'payer_phone',
      accepted_privacy_policy_at = (new.raw_user_meta_data->>'accepted_privacy_policy_at')::timestamptz,
      accepted_terms_at = (new.raw_user_meta_data->>'accepted_terms_at')::timestamptz
    WHERE id = meta_student_id::uuid;

    SELECT organization_id INTO v_org_id FROM public.students WHERE id = meta_student_id::uuid;
    IF v_org_id IS NOT NULL THEN
      INSERT INTO public.profiles (id, email, full_name, phone, organization_id)
      VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone', v_org_id)
      ON CONFLICT (id) DO UPDATE SET organization_id = v_org_id;
    END IF;

    RETURN new;
  END IF;

  SELECT s.id INTO student_id_to_link
  FROM public.students s
  WHERE s.linked_user_id IS NULL
    AND trim(lower(coalesce(s.email, ''))) = trim(lower(coalesce(new.email, '')))
  LIMIT 1;

  IF student_id_to_link IS NOT NULL THEN
    UPDATE public.students
    SET linked_user_id = new.id, email = coalesce(new.email, email)
    WHERE id = student_id_to_link;
    GET DIAGNOSTICS linked_count = ROW_COUNT;
    IF linked_count > 0 THEN
      SELECT organization_id INTO v_org_id FROM public.students WHERE id = student_id_to_link;
      IF v_org_id IS NOT NULL THEN
        INSERT INTO public.profiles (id, email, full_name, organization_id)
        VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', v_org_id)
        ON CONFLICT (id) DO UPDATE SET organization_id = v_org_id;
      END IF;
      RETURN new;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$function$;
