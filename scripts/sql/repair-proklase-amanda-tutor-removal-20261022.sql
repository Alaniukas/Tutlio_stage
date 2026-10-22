-- One-off repair for the interrupted tutor removal investigated on 2026-10-22.
-- Run only after customer-data correction approval and exporting affected rows.
-- Uses the existing server-only package cancellation/creation functions; no
-- invoice, paid credit, Checkout Session, email or notification is created.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';

DO $$
DECLARE
  org_id constant uuid := '3422031d-6e21-424d-980b-35a9c6d7b8f1';
  source_id constant uuid := 'beabb176-4c62-4f64-85e7-f3d98e13a6e3';
  math_id constant uuid := 'd0ff2bbf-a400-4016-abb4-1610ac285fdb';
  old_tutor constant uuid := '0bf3cd22-151b-4d1a-95c6-1e1568c5c597';
  math_tutor constant uuid := '933cf588-d10a-46b8-9829-e67e404e9c53';
  series_id constant uuid := '932867e4-0c7b-49e1-a9eb-13c74f0b7401';
  math_series_id constant uuid := '3e1af963-ca33-430d-be12-27dc9ff573e2';
  old_offer_id constant uuid := '919deebb-b557-4134-80b7-ef72af1446cf';
  lithuanian_subject constant uuid := 'ab71a8ea-bc66-4b41-98ee-33838713e621';
  math_subject constant uuid := 'a1e086b2-321d-4e4c-84ac-34a2742de9f1';
  source_student public.students%ROWTYPE;
  math_student public.students%ROWTYPE;
  series public.recurring_individual_sessions%ROWTYPE;
  old_offer public.lesson_packages%ROWTYPE;
  math_hash text;
  next_math_id uuid;
  replacement_id uuid;
BEGIN
  PERFORM id FROM public.students WHERE id IN (source_id, math_id) ORDER BY id FOR UPDATE;
  SELECT * INTO source_student FROM public.students WHERE id = source_id;
  SELECT * INTO math_student FROM public.students WHERE id = math_id;
  IF source_student.id IS NULL OR math_student.id IS NULL
    OR source_student.organization_id IS DISTINCT FROM org_id
    OR math_student.organization_id IS DISTINCT FROM org_id
    OR source_student.linked_user_id IS NULL
    OR source_student.linked_user_id IS DISTINCT FROM math_student.linked_user_id
    OR lower(trim(source_student.full_name)) IS DISTINCT FROM 'amanda'
    OR lower(trim(math_student.full_name)) IS DISTINCT FROM 'amanda'
    OR source_student.detached_at IS NOT NULL OR math_student.detached_at IS NOT NULL
    OR math_student.tutor_id IS DISTINCT FROM math_tutor
  THEN RAISE EXCEPTION 'Repair identity changed; review again'; END IF;

  SELECT * INTO STRICT series FROM public.recurring_individual_sessions WHERE id = series_id FOR UPDATE;
  SELECT * INTO STRICT old_offer FROM public.lesson_packages WHERE id = old_offer_id FOR UPDATE;
  PERFORM id FROM public.sessions WHERE recurring_session_id IN (series_id, math_series_id) ORDER BY id FOR UPDATE;

  -- A retry after a lost response is safe, including if the replacement was paid.
  IF source_student.tutor_id IS NULL AND NOT series.active
    AND old_offer.payment_status = 'cancelled'
    AND (SELECT count(*) FROM public.sessions WHERE recurring_session_id = series_id) = 34
    AND NOT EXISTS (SELECT 1 FROM public.sessions WHERE recurring_session_id = series_id
      AND (status <> 'cancelled' OR student_id <> source_id OR tutor_id <> old_tutor))
    AND EXISTS (SELECT 1 FROM public.lesson_packages p
      JOIN public.lesson_package_items item ON item.package_id = p.id
      WHERE p.id <> old_offer_id AND p.pool_organization_id = org_id AND p.student_id = math_id
        AND p.billing_period_end = '2026-10-31' AND p.total_lessons = 1 AND p.total_price = 29
        AND p.payment_status <> 'cancelled' AND item.subject_id = math_subject AND item.total_lessons = 1)
  THEN RETURN; END IF;

  IF source_student.tutor_id IS DISTINCT FROM old_tutor
    OR series.student_id IS DISTINCT FROM source_id OR series.tutor_id IS DISTINCT FROM old_tutor
    OR series.subject_id IS DISTINCT FROM lithuanian_subject OR series.active IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'Repair assignment changed; review again'; END IF;

  IF (SELECT count(*) FROM public.sessions WHERE recurring_session_id = series_id) <> 34
    OR EXISTS (SELECT 1 FROM public.sessions WHERE recurring_session_id = series_id AND (
      student_id IS DISTINCT FROM math_id OR tutor_id IS DISTINCT FROM math_tutor OR subject_id IS DISTINCT FROM lithuanian_subject
      OR status IS DISTINCT FROM 'active' OR start_time IS NULL OR start_time <= now()
      OR paid IS DISTINCT FROM false OR lesson_package_id IS NOT NULL
      OR class_group_id IS NOT NULL OR status_confirmed_at IS NOT NULL
      OR (start_time AT TIME ZONE 'Europe/Vilnius')::date NOT BETWEEN '2026-10-22' AND '2027-06-10'
      OR extract(isodow FROM start_time AT TIME ZONE 'Europe/Vilnius') <> 4
      OR (start_time AT TIME ZONE 'Europe/Vilnius')::time <> '18:30'))
    OR EXISTS (SELECT 1 FROM public.invoice_line_items item JOIN public.sessions s
      ON item.session_ids @> ARRAY[s.id] WHERE s.recurring_session_id = series_id)
    OR EXISTS (SELECT 1 FROM public.invoices i JOIN public.sessions s
      ON s.id = i.source_session_id WHERE s.recurring_session_id = series_id)
  THEN RAISE EXCEPTION 'Repair lessons changed or billing exists; review again'; END IF;

  IF old_offer.student_id IS DISTINCT FROM math_id OR old_offer.tutor_id IS DISTINCT FROM math_tutor
    OR old_offer.pool_organization_id IS DISTINCT FROM org_id
    OR old_offer.paid IS DISTINCT FROM false OR old_offer.payment_status IS DISTINCT FROM 'pending' OR old_offer.cancelled_at IS NOT NULL
    OR old_offer.total_lessons IS DISTINCT FROM 3 OR old_offer.total_price IS DISTINCT FROM 87
    OR old_offer.available_lessons IS DISTINCT FROM 3
    OR old_offer.reserved_lessons IS DISTINCT FROM 0 OR old_offer.completed_lessons IS DISTINCT FROM 0
    OR old_offer.billing_period_start IS DISTINCT FROM date '2026-10-01'
    OR old_offer.billing_period_end IS DISTINCT FROM date '2026-10-31'
    OR old_offer.stripe_checkout_session_id IS NOT NULL OR old_offer.manual_sales_invoice_id IS NOT NULL
    OR (SELECT count(*) FROM public.lesson_package_items WHERE package_id = old_offer_id) <> 2
    OR NOT EXISTS (SELECT 1 FROM public.lesson_package_items WHERE package_id = old_offer_id
      AND subject_id = math_subject AND total_lessons = 1 AND total_price = 29)
    OR NOT EXISTS (SELECT 1 FROM public.lesson_package_items WHERE package_id = old_offer_id
      AND subject_id = lithuanian_subject AND total_lessons = 2 AND total_price = 58)
    OR EXISTS (SELECT 1 FROM public.sessions WHERE lesson_package_id = old_offer_id)
  THEN RAISE EXCEPTION 'Repair offer changed; review payment state again'; END IF;

  IF (SELECT count(*) FROM public.sessions WHERE recurring_session_id = math_series_id) <> 35
  THEN RAISE EXCEPTION 'Mathematics series changed; review again'; END IF;
  SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY s.id)::text) INTO math_hash
  FROM public.sessions s WHERE recurring_session_id = math_series_id;
  SELECT id INTO next_math_id FROM public.sessions WHERE recurring_session_id = math_series_id
    AND subject_id = math_subject AND student_id = math_id AND tutor_id = math_tutor
    AND status = 'active' AND NOT paid AND lesson_package_id IS NULL
    AND (start_time AT TIME ZONE 'Europe/Vilnius')::date = '2026-10-26';
  IF next_math_id IS NULL THEN RAISE EXCEPTION 'Remaining October mathematics lesson changed'; END IF;

  PERFORM public.cancel_pending_lesson_package(old_offer_id, org_id, NULL);
  UPDATE public.sessions SET student_id = source_id, tutor_id = old_tutor,
    status = 'cancelled', cancelled_at = now(), cancelled_by = 'tutor', hidden_from_calendar = true,
    cancellation_penalty_amount = 0, penalty_resolution = NULL, is_late_cancelled = false
  WHERE recurring_session_id = series_id;
  UPDATE public.recurring_individual_sessions SET active = false WHERE id = series_id;
  UPDATE public.students SET tutor_id = NULL WHERE id = source_id;

  -- Reissue the corrected quote through the normal package implementation.
  -- The preview token is server-side idempotency state, not an authorization key.
  SELECT public.create_org_student_package(
    math_id, org_id, ARRAY[math_id, source_id],
    jsonb_build_array(jsonb_build_object('subjectId', math_subject, 'totalLessons', 1)),
    29, '2026-10-01', '2026-10-31',
    md5(old_offer_id::text || ':math-only') || md5(next_math_id::text || ':20261022'),
    ARRAY[next_math_id]
  ) INTO replacement_id;

  IF (SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY s.id)::text) FROM public.sessions s
      WHERE recurring_session_id = math_series_id) IS DISTINCT FROM math_hash
  THEN RAISE EXCEPTION 'Mathematics lessons changed during repair'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lesson_packages WHERE id = replacement_id
      AND total_lessons = 1 AND total_price = 29 AND NOT paid)
  THEN RAISE EXCEPTION 'Replacement package does not match the intended quote'; END IF;
END;
$$;
COMMIT;
