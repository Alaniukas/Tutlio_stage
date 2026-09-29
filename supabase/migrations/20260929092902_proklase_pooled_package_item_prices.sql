-- A pooled package still has one fungible lesson balance, but the sale can
-- contain subjects with different individual prices. Keep the original RPC
-- signature so older callers without item prices use p_unit_price.
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
  -- Serialize creation for this organization, including requests from sibling identity rows.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text || package_student_identity(v_student), 0));
  SELECT id INTO v_id FROM lesson_packages WHERE pool_organization_id=p_org_id
    AND pool_identity_key=package_student_identity(v_student) AND billing_period_end=p_period_end AND payment_status <> 'cancelled';
  IF v_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pooled_package_quotes WHERE package_id=v_id AND preview_token=p_preview_token) THEN
      RAISE EXCEPTION 'A package already exists for this student and period';
    END IF;
    RETURN v_id;
  END IF;
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
REVOKE ALL ON FUNCTION public.create_org_student_package(uuid,uuid,uuid[],jsonb,numeric,date,date,text,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_org_student_package(uuid,uuid,uuid[],jsonb,numeric,date,date,text,uuid[]) TO service_role;
