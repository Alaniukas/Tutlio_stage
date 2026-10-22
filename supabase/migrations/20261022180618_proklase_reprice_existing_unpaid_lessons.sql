-- A Pro Klase administrator's frequency correction also applies to existing
-- unpaid lessons that have already taken place. Do not backfill on deployment:
-- repricing happens only when the existing student-card RPC is called.
CREATE OR REPLACE FUNCTION public.set_student_pricing_frequency(
  p_student_id uuid,
  p_lessons_per_week smallint
)
RETURNS smallint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_tutor uuid;
  v_org uuid;
  v_allowed boolean := false;
  v_org_admin boolean := false;
  v_targets uuid[];
  v_freq smallint;
  v_reprice_history boolean;
BEGIN
  IF v_caller IS NULL OR NOT COALESCE(private.has_active_auth_session(), false) THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_lessons_per_week IS NOT NULL AND p_lessons_per_week < 1 THEN
    RAISE EXCEPTION 'Lessons per week must be at least 1';
  END IF;

  SELECT student.tutor_id, COALESCE(student.organization_id, tutor.organization_id)
  INTO v_tutor, v_org
  FROM public.students student
  LEFT JOIN public.profiles tutor ON tutor.id = student.tutor_id
  WHERE student.id = p_student_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student not found'; END IF;

  v_allowed := v_tutor IS NOT NULL AND v_tutor = v_caller;
  IF v_org IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.organization_admins admin
      WHERE admin.user_id = v_caller AND admin.organization_id = v_org
        AND admin.status = 'active' AND admin.accepted_at IS NOT NULL
        AND (admin.role = 'owner'
          OR COALESCE(admin.permissions ->> 'students.edit', 'false') = 'true'
          OR COALESCE(admin.permissions ->> 'finance.edit', 'false') = 'true'
          OR COALESCE(admin.permissions ->> 'sessions.edit', 'false') = 'true')
    ) INTO v_org_admin;
  END IF;
  IF NOT (v_allowed OR v_org_admin) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF v_org_admin THEN
    SELECT array_agg(id) INTO v_targets FROM private.pricing_identity_student_ids(p_student_id) AS ids(id);
  ELSE
    v_targets := ARRAY[p_student_id];
    IF p_lessons_per_week IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.students
      WHERE id IN (SELECT private.pricing_identity_student_ids(p_student_id))
        AND id <> p_student_id AND pricing_lessons_per_week_is_manual
        AND pricing_lessons_per_week IS DISTINCT FROM p_lessons_per_week
    ) THEN RAISE EXCEPTION 'Organization admin must change the shared pricing contract'; END IF;
  END IF;
  v_reprice_history := v_org_admin AND v_org IN (
    '3422031d-6e21-424d-980b-35a9c6d7b8f1'::uuid,
    'b0a00000-7e57-4000-8000-000000000001'::uuid
  );

  IF p_lessons_per_week IS NULL THEN
    UPDATE public.students SET pricing_lessons_per_week_is_manual = false WHERE id = ANY(v_targets);
    SELECT private.pricing_identity_effective_frequency(p_student_id) INTO v_freq;
    UPDATE public.students SET pricing_lessons_per_week = v_freq WHERE id = ANY(v_targets);
  ELSE
    v_freq := p_lessons_per_week;
    UPDATE public.students
    SET pricing_lessons_per_week = v_freq, pricing_lessons_per_week_is_manual = true
    WHERE id = ANY(v_targets);
  END IF;

  UPDATE public.sessions lesson_session
  SET price = tier.price
  FROM public.students student
  CROSS JOIN LATERAL (
    SELECT pricing.price FROM public.organization_dynamic_pricing pricing
    WHERE pricing.organization_id = COALESCE(student.organization_id, v_org)
      AND pricing.lessons_per_week = student.pricing_lessons_per_week
      AND (
        CASE WHEN substring(COALESCE(student.grade, '') FROM '([0-9]{1,2})') IS NULL THEN NULL
          ELSE substring(student.grade FROM '([0-9]{1,2})')::smallint END
      ) BETWEEN pricing.grade_min AND pricing.grade_max
    ORDER BY (pricing.grade_max - pricing.grade_min), pricing.grade_min
    LIMIT 1
  ) tier
  WHERE student.id = ANY(v_targets)
    AND lesson_session.student_id = student.id
    AND (lesson_session.start_time > now() OR v_reprice_history)
    AND COALESCE(lesson_session.paid, false) = false
    -- "confirmed" can be an unpaid monthly-billing lesson, rather than a payment.
    AND COALESCE(lesson_session.payment_status, 'pending') IN ('pending', 'confirmed')
    AND lesson_session.status IN ('active', 'completed', 'no_show')
    AND NOT COALESCE(lesson_session.is_complimentary, false)
    AND lesson_session.class_group_id IS NULL
    AND lesson_session.lesson_package_id IS NULL
    AND lesson_session.payment_batch_id IS NULL
    AND lesson_session.stripe_checkout_session_id IS NULL
    AND lesson_session.perlas_transaction_id IS NULL
    AND (
      lesson_session.subject_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.subjects subject
        WHERE subject.id = lesson_session.subject_id
          AND (COALESCE(subject.is_trial, false) OR COALESCE(subject.is_group, false))
      )
    )
    AND (
      lesson_session.subject_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.student_individual_pricing individual
        WHERE individual.student_id = lesson_session.student_id
          AND individual.subject_id = lesson_session.subject_id
      )
    )
    -- Customer invoice snapshots and package quotes need their own explicit
    -- correction flow. A tutor's pay invoice does not fix the client's price.
    AND NOT EXISTS (
      SELECT 1 FROM public.invoices invoice
      WHERE invoice.status <> 'cancelled'
        AND COALESCE(invoice.pdf_meta ->> 'invoiceKind', '') <> 'tutor_pay'
        AND (invoice.source_session_id = lesson_session.id OR EXISTS (
          SELECT 1 FROM public.invoice_line_items line
          WHERE line.invoice_id = invoice.id AND lesson_session.id = ANY(line.session_ids)
        ))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.pooled_package_quotes quote
      JOIN public.lesson_packages package ON package.id = quote.package_id
      WHERE lesson_session.id = ANY(quote.session_ids)
        AND package.cancelled_at IS NULL
        AND COALESCE(package.payment_status, 'pending') <> 'cancelled'
    )
    AND lesson_session.price IS DISTINCT FROM tier.price;

  RETURN v_freq;
END;
$$;

REVOKE ALL ON FUNCTION public.set_student_pricing_frequency(uuid, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_student_pricing_frequency(uuid, smallint) TO authenticated, service_role;
