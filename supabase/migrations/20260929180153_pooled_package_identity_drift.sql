-- Linking a student account changes package_student_identity from its email
-- fallback to a user-based key. Existing pooled sales retain their original
-- key, so live identity checks must not invalidate an already allocated lesson.
-- Keep the old key for audit and accept it only when the package anchor still
-- has that email identity. Distinct linked accounts cannot share the fallback.
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.pooled_package_email_identity(p_student public.students)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_unlinked public.students;
BEGIN
  IF nullif(trim(p_student.email), '') IS NULL THEN RETURN NULL; END IF;
  v_unlinked := p_student;
  v_unlinked.linked_user_id := NULL;
  RETURN public.package_student_identity(v_unlinked);
END;
$$;
REVOKE ALL ON FUNCTION private.pooled_package_email_identity(public.students) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.pooled_package_email_identity(public.students) TO service_role;

CREATE OR REPLACE FUNCTION private.pooled_package_matches_student(
  p_student public.students, p_package public.lesson_packages
) RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(
    p_student.organization_id = p_package.pool_organization_id
    AND p_student.detached_at IS NULL
    AND (
      public.package_student_identity(p_student) = p_package.pool_identity_key
      OR (
        private.pooled_package_email_identity(p_student) = p_package.pool_identity_key
        AND EXISTS (
          SELECT 1 FROM public.students anchor
          WHERE anchor.id = p_package.student_id
            AND anchor.organization_id = p_package.pool_organization_id
            AND anchor.detached_at IS NULL
            AND private.pooled_package_email_identity(anchor) = p_package.pool_identity_key
            AND (p_student.id = anchor.id OR p_student.linked_user_id IS NULL
              OR (anchor.linked_user_id IS NOT NULL
                AND anchor.linked_user_id = p_student.linked_user_id))
        )
      )
    ), false
  );
$$;
REVOKE ALL ON FUNCTION private.pooled_package_matches_student(public.students, public.lesson_packages)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.pooled_package_matches_student(public.students, public.lesson_packages)
  TO service_role;

CREATE OR REPLACE FUNCTION public.allocate_pooled_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_pkg public.lesson_packages;
  v_student public.students;
  v_count integer;
  v_validate_identity boolean;
BEGIN
  IF NEW.lesson_package_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_pkg FROM lesson_packages WHERE id=NEW.lesson_package_id FOR UPDATE;
  IF v_pkg.pool_organization_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP='INSERT' THEN
    v_validate_identity := true;
  ELSE
    v_validate_identity := OLD.lesson_package_id IS DISTINCT FROM NEW.lesson_package_id
      OR OLD.student_id IS DISTINCT FROM NEW.student_id
      OR OLD.tutor_id IS DISTINCT FROM NEW.tutor_id
      OR OLD.subject_id IS DISTINCT FROM NEW.subject_id
      OR OLD.is_complimentary IS DISTINCT FROM NEW.is_complimentary
      OR OLD.is_makeup IS DISTINCT FROM NEW.is_makeup
      OR (OLD.status='cancelled' AND NEW.status IN ('active','completed','no_show'));
  END IF;
  -- Status, comments and reminder stamps on an existing allocation do not
  -- reassign its credit. Student account linkage may have changed since sale.
  IF v_validate_identity THEN
    SELECT * INTO v_student FROM students WHERE id=NEW.student_id;
    IF NOT private.pooled_package_matches_student(v_student, v_pkg)
      OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=NEW.tutor_id AND organization_id=v_pkg.pool_organization_id)
      OR NOT EXISTS(SELECT 1 FROM subjects WHERE id=NEW.subject_id AND tutor_id=NEW.tutor_id AND NOT coalesce(is_trial,false))
      OR coalesce(NEW.is_complimentary,false) OR coalesce(NEW.is_makeup,false)
      THEN RAISE EXCEPTION 'Session outside package identity or organization'; END IF;
  END IF;
  IF TG_OP='INSERT' OR OLD.lesson_package_id IS DISTINCT FROM NEW.lesson_package_id OR OLD.start_time IS DISTINCT FROM NEW.start_time
    OR (OLD.status='cancelled' AND NEW.status IN ('active','completed','no_show')) THEN
    IF NOT v_pkg.paid OR NOT v_pkg.active OR v_pkg.payment_status <> 'paid' OR (v_pkg.expires_at <= now() AND pg_trigger_depth() < 2)
      OR (NEW.start_time AT TIME ZONE 'Europe/Vilnius')::date NOT BETWEEN v_pkg.billing_period_start AND v_pkg.billing_period_end
      THEN RAISE EXCEPTION 'Package is unavailable for this lesson'; END IF;
  END IF;
  SELECT count(*) INTO v_count FROM sessions WHERE lesson_package_id=v_pkg.id AND id<>NEW.id
    AND (status IN ('active','completed','no_show') OR (status='cancelled' AND is_late_cancelled));
  IF (NEW.status IN ('active','completed','no_show') OR (NEW.status='cancelled' AND NEW.is_late_cancelled)) AND v_count>=v_pkg.total_lessons
    THEN RAISE EXCEPTION 'No pooled credits available'; END IF;
  RETURN NEW;
END; $$;

-- A pending email-key offer must still be found after account linking. Lock
-- within the organization so offers under old and new keys cannot race past
-- each other while preserving the existing idempotent preview-token behavior.
CREATE OR REPLACE FUNCTION public.create_org_student_package(
  p_student_id uuid, p_org_id uuid, p_student_ids uuid[], p_items jsonb,
  p_unit_price numeric, p_period_start date, p_period_end date, p_preview_token text, p_session_ids uuid[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student public.students;
  v_id uuid;
  v_total integer;
  v_item jsonb;
  v_priced_items jsonb := '[]'::jsonb;
  v_item_price numeric;
  v_first_price numeric;
  v_mixed_prices boolean := false;
  v_total_price numeric := 0;
BEGIN
  IF p_org_id NOT IN (
    '3422031d-6e21-424d-980b-35a9c6d7b8f1'::uuid,
    'b0a00000-7e57-4000-8000-000000000001'::uuid
  ) THEN RAISE EXCEPTION 'Pooled packages are not enabled for this organization'; END IF;
  SELECT * INTO STRICT v_student FROM students WHERE id = p_student_id AND organization_id = p_org_id AND detached_at IS NULL;
  IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=v_student.tutor_id AND organization_id=p_org_id) THEN
    RAISE EXCEPTION 'Student anchor tutor is outside the organization';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text, 0));
  SELECT p.id INTO v_id FROM lesson_packages p WHERE p.pool_organization_id=p_org_id
    AND private.pooled_package_matches_student(v_student, p)
    AND p.billing_period_end=p_period_end AND p.payment_status <> 'cancelled'
    ORDER BY p.created_at LIMIT 1;
  IF v_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pooled_package_quotes WHERE package_id=v_id AND preview_token=p_preview_token) THEN
      RAISE EXCEPTION 'A package already exists for this student and period';
    END IF;
    RETURN v_id;
  END IF;
  IF p_student_id <> ALL(p_student_ids) OR cardinality(p_student_ids) < 1 OR EXISTS (
    SELECT 1 FROM unnest(p_student_ids) AS ids(student_id) LEFT JOIN students s ON s.id = ids.student_id
    WHERE s.id IS NULL OR s.organization_id IS DISTINCT FROM p_org_id OR s.detached_at IS NOT NULL
      OR package_student_identity(s) <> package_student_identity(v_student)
  ) THEN RAISE EXCEPTION 'Invalid student identity'; END IF;
  IF p_period_start <> date_trunc('month', p_period_start)::date
    OR p_period_end <> (date_trunc('month', p_period_start) + interval '1 month - 1 day')::date
    OR (p_unit_price IS NOT NULL AND (
      p_unit_price::text IN ('NaN', 'Infinity', '-Infinity')
      OR p_unit_price <= 0 OR p_unit_price <> round(p_unit_price, 2)
    )) THEN RAISE EXCEPTION 'Invalid package terms'; END IF;
  SELECT sum((item->>'totalLessons')::integer) INTO v_total FROM jsonb_array_elements(p_items) item;
  IF v_total IS NULL OR v_total NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid credit total'; END IF;
  IF cardinality(p_session_ids) <> v_total OR (SELECT count(DISTINCT id) FROM unnest(p_session_ids) id) <> v_total THEN
    RAISE EXCEPTION 'Invalid session total'; END IF;
  PERFORM 1 FROM sessions WHERE id=ANY(p_session_ids) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM sessions s JOIN subjects sub ON sub.id=s.subject_id JOIN profiles t ON t.id=s.tutor_id
    WHERE s.id=ANY(p_session_ids) AND s.student_id=ANY(p_student_ids) AND t.organization_id=p_org_id
      AND sub.tutor_id=s.tutor_id AND NOT coalesce(sub.is_trial,false)
      AND s.status IN ('active','completed') AND NOT s.paid AND s.lesson_package_id IS NULL
      AND NOT coalesce(s.is_complimentary,false) AND NOT coalesce(s.is_makeup,false)
      AND (s.start_time AT TIME ZONE 'Europe/Vilnius')::date BETWEEN p_period_start AND p_period_end) <> v_total
    THEN RAISE EXCEPTION 'Schedule changed; refresh the package preview'; END IF;
  IF (SELECT count(*) FROM sessions s JOIN subjects sub ON sub.id=s.subject_id JOIN profiles t ON t.id=s.tutor_id
    WHERE s.student_id=ANY(p_student_ids) AND t.organization_id=p_org_id
      AND sub.tutor_id=s.tutor_id AND NOT coalesce(sub.is_trial,false)
      AND s.status IN ('active','completed') AND NOT s.paid AND s.lesson_package_id IS NULL
      AND NOT coalesce(s.is_complimentary,false) AND NOT coalesce(s.is_makeup,false)
      AND (s.start_time AT TIME ZONE 'Europe/Vilnius')::date BETWEEN p_period_start AND p_period_end) <> v_total
    THEN RAISE EXCEPTION 'Schedule changed; refresh the package preview'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_item->>'totalLessons')::integer <= 0 OR NOT EXISTS (
      SELECT 1 FROM subjects s JOIN profiles t ON t.id=s.tutor_id
      WHERE s.id=(v_item->>'subjectId')::uuid AND t.organization_id=p_org_id
    ) THEN RAISE EXCEPTION 'Invalid package subject'; END IF;
    IF (SELECT count(*) FROM sessions WHERE id=ANY(p_session_ids) AND subject_id=(v_item->>'subjectId')::uuid)
      <> (v_item->>'totalLessons')::integer THEN RAISE EXCEPTION 'Subject breakdown does not match sessions'; END IF;
    IF v_item ? 'pricePerLesson' THEN
      IF jsonb_typeof(v_item->'pricePerLesson') <> 'number' THEN
        RAISE EXCEPTION 'Invalid package item price';
      END IF;
      v_item_price := (v_item->>'pricePerLesson')::numeric;
    ELSE
      v_item_price := p_unit_price;
    END IF;
    IF v_item_price IS NULL OR v_item_price::text IN ('NaN', 'Infinity', '-Infinity')
      OR v_item_price <= 0 OR v_item_price <> round(v_item_price, 2) THEN
      RAISE EXCEPTION 'Invalid package item price';
    END IF;
    IF v_first_price IS NULL THEN
      v_first_price := v_item_price;
    ELSIF v_item_price <> v_first_price THEN
      v_mixed_prices := true;
    END IF;
    v_total_price := v_total_price + (v_item->>'totalLessons')::integer * v_item_price;
    v_priced_items := v_priced_items || jsonb_build_array(v_item || jsonb_build_object('pricePerLesson', v_item_price));
  END LOOP;
  IF (SELECT count(DISTINCT item->>'subjectId') FROM jsonb_array_elements(p_items) item) <> jsonb_array_length(p_items)
    THEN RAISE EXCEPTION 'Duplicate subject'; END IF;
  INSERT INTO lesson_packages(tutor_id,student_id,subject_id,total_lessons,available_lessons,reserved_lessons,completed_lessons,
    price_per_lesson,total_price,paid,payment_status,active,payment_method,billing_period_start,billing_period_end,expires_at,
    pool_organization_id,pool_identity_key)
  VALUES(v_student.tutor_id,p_student_id,NULL,v_total,v_total,0,0,
    CASE WHEN v_mixed_prices THEN NULL ELSE v_first_price END,v_total_price,false,'pending',true,'stripe',
    p_period_start,p_period_end,((p_period_end+1)::timestamp AT TIME ZONE 'Europe/Vilnius'),p_org_id,package_student_identity(v_student))
  RETURNING id INTO v_id;
  INSERT INTO pooled_package_quotes(package_id,preview_token,session_ids) VALUES(v_id,p_preview_token,p_session_ids);
  INSERT INTO lesson_package_items(package_id,subject_id,total_lessons,available_lessons,reserved_lessons,completed_lessons,price_per_lesson,total_price,position)
    SELECT v_id,(item->>'subjectId')::uuid,(item->>'totalLessons')::integer,(item->>'totalLessons')::integer,0,0,
      (item->>'pricePerLesson')::numeric,(item->>'totalLessons')::integer*(item->>'pricePerLesson')::numeric,ordinality-1
    FROM jsonb_array_elements(v_priced_items) WITH ORDINALITY AS x(item,ordinality);
  RETURN v_id;
END; $$;

-- A paid legacy pool must remain available for later lessons after account
-- linking. Keep the existing caller authorization and fixed safe projection.
CREATE OR REPLACE FUNCTION public.get_pooled_packages_for_student(p_student_id uuid)
RETURNS TABLE (
  id uuid, tutor_id uuid, student_id uuid, subject_id uuid, total_lessons integer,
  available_lessons integer, reserved_lessons integer, completed_lessons integer,
  expires_at timestamptz, pool_organization_id uuid,
  billing_period_start date, billing_period_end date
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.id, p.tutor_id, p.student_id, p.subject_id, p.total_lessons,
    p.available_lessons, p.reserved_lessons, p.completed_lessons, p.expires_at,
    p.pool_organization_id, p.billing_period_start, p.billing_period_end
  FROM lesson_packages p JOIN students s ON s.id=p_student_id
    AND private.pooled_package_matches_student(s, p)
  WHERE p.paid AND p.active AND p.payment_status='paid'
    AND p.available_lessons>0 AND p.expires_at>now()
    AND (
      coalesce(auth.role(),'')='service_role'
      OR s.tutor_id=auth.uid()
      OR s.linked_user_id=auth.uid()
      OR EXISTS (SELECT 1 FROM organization_admins oa
        WHERE oa.organization_id=s.organization_id AND oa.user_id=auth.uid())
    )
  ORDER BY p.created_at;
$$;

-- Payment can arrive after the student claims an account. Continue allocating
-- the frozen quote and the per-subject price from the latest payment function.
CREATE OR REPLACE FUNCTION public.apply_paid_pooled_package() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_session_ids uuid[];
BEGIN
  IF NEW.pool_organization_id IS NOT NULL AND NEW.paid AND NOT OLD.paid THEN
    SELECT session_ids INTO v_session_ids FROM pooled_package_quotes WHERE package_id=NEW.id;
    IF v_session_ids IS NULL THEN RAISE EXCEPTION 'Pooled package quote is missing'; END IF;
    UPDATE sessions
    SET lesson_package_id=NEW.id,
        paid=true,
        payment_status='paid',
        price=coalesce((
          SELECT item.price_per_lesson
          FROM lesson_package_items item
          WHERE item.package_id=NEW.id AND item.subject_id=sessions.subject_id
        ), sessions.price)
      WHERE id=ANY(v_session_ids) AND lesson_package_id IS NULL AND NOT paid
        AND status IN ('active','completed') AND NOT coalesce(is_complimentary,false) AND NOT coalesce(is_makeup,false)
        AND (start_time AT TIME ZONE 'Europe/Vilnius')::date BETWEEN NEW.billing_period_start AND NEW.billing_period_end
        AND EXISTS (
          SELECT 1 FROM students student
          WHERE student.id=sessions.student_id
            AND private.pooled_package_matches_student(student, NEW)
        )
        AND EXISTS (
          SELECT 1 FROM profiles tutor
          WHERE tutor.id=sessions.tutor_id AND tutor.organization_id=NEW.pool_organization_id
        )
        AND EXISTS (
          SELECT 1 FROM subjects subject
          WHERE subject.id=sessions.subject_id AND subject.tutor_id=sessions.tutor_id
            AND NOT coalesce(subject.is_trial,false)
        );
  END IF;
  RETURN NULL;
END; $$;
