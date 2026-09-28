-- An opted-in school child is linked only by the verified server workflow.
-- Client-controlled signup metadata is not proof of a child relationship.
-- Preparation alone retains the existing signup behavior until cutover.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  meta_role text := lower(trim(coalesce(new.raw_user_meta_data->>'role', '')));
  meta_student_id text := trim(coalesce(new.raw_user_meta_data->>'student_id', ''));
  linked_count int;
BEGIN
  IF new.raw_app_meta_data ? 'provisioned_by_organization' OR meta_role = 'parent' THEN
    RETURN new;
  END IF;

  IF (meta_role = 'student' OR meta_student_id <> '') AND meta_student_id <> '' THEN
    UPDATE public.students
    SET linked_user_id = new.id,
        email = new.email,
        phone = coalesce(nullif(new.raw_user_meta_data->>'phone', ''), phone),
        age = coalesce(nullif(new.raw_user_meta_data->>'age', '')::integer, age),
        grade = coalesce(nullif(new.raw_user_meta_data->>'grade', ''), grade),
        subject_id = coalesce(nullif(new.raw_user_meta_data->>'subject_id', '')::uuid, subject_id),
        payment_payer = coalesce(nullif(new.raw_user_meta_data->>'payment_payer', ''), payment_payer),
        payer_name = coalesce(nullif(new.raw_user_meta_data->>'payer_name', ''), payer_name),
        payer_email = coalesce(nullif(new.raw_user_meta_data->>'payer_email', ''), payer_email),
        payer_phone = coalesce(nullif(new.raw_user_meta_data->>'payer_phone', ''), payer_phone),
        accepted_privacy_policy_at = coalesce(nullif(new.raw_user_meta_data->>'accepted_privacy_policy_at', '')::timestamptz, accepted_privacy_policy_at),
        accepted_terms_at = coalesce(nullif(new.raw_user_meta_data->>'accepted_terms_at', '')::timestamptz, accepted_terms_at)
    WHERE id = meta_student_id::uuid
      AND detached_at IS NULL
      AND linked_user_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.organizations o WHERE o.id = students.organization_id
          AND o.entity_type = 'school' AND o.features->'school_family_portal' = 'true'::jsonb
      );
    GET DIAGNOSTICS linked_count = ROW_COUNT;
    IF linked_count <> 1 THEN
      RAISE EXCEPTION 'Student is unavailable for registration';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$function$;
