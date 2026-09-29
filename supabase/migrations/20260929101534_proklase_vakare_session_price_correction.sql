-- Vakarė's two math series were created on 2026-09-25 before the 25 EUR
-- individual price was saved. Reprice only the original, still-unpaid lesson
-- rows; any later payment, package allocation, cancellation, or manual price
-- change leaves that row untouched. No package or invoice terms are changed.
DO $price_correction$
DECLARE
  v_student_id constant uuid := '231f729f-7921-4164-9a36-ad41ca296844';
  v_tutor_id constant uuid := '8a33c53f-11f8-41c4-b29c-7d37cefeee6a';
  v_subject_id constant uuid := 'c3b4f797-8892-40b7-bf02-42aac88a8b22';
  v_org_id constant uuid := '3422031d-6e21-424d-980b-35a9c6d7b8f1';
  v_candidate_count integer;
  v_updated_count integer;
BEGIN
  -- Abort if this is no longer the same Pro Klasė pairing and price decision.
  IF NOT EXISTS (
    SELECT 1
    FROM public.students student
    JOIN public.profiles tutor ON tutor.id = student.tutor_id
    JOIN public.subjects subject ON subject.id = v_subject_id AND subject.tutor_id = tutor.id
    JOIN public.student_individual_pricing override_price
      ON override_price.student_id = student.id
     AND override_price.tutor_id = tutor.id
     AND override_price.subject_id = subject.id
    WHERE student.id = v_student_id
      AND student.tutor_id = v_tutor_id
      AND student.organization_id = v_org_id
      AND tutor.organization_id = v_org_id
      AND override_price.id = 'ca40b639-9f05-460e-b88e-01211e71235a'::uuid
      AND override_price.price = 25.00
      AND override_price.created_at = '2026-09-25 10:37:00.243247+03'::timestamptz
  ) THEN
    RAISE EXCEPTION 'Vakarė price correction aborted: Pro Klasė pairing or 25 EUR override changed';
  END IF;

  SELECT count(*) INTO v_candidate_count
  FROM public.sessions lesson
  WHERE lesson.student_id = v_student_id
    AND lesson.tutor_id = v_tutor_id
    AND lesson.subject_id = v_subject_id
    AND lesson.recurring_session_id IN (
      '1cdb4924-9b2a-4afa-88b0-e29e070e10a3'::uuid,
      '52e741e5-4e31-4617-ad6c-c699fa37a312'::uuid
    )
    AND lesson.created_at BETWEEN '2026-09-25 06:52:54.425784+03'::timestamptz
                              AND '2026-09-25 06:53:59.201231+03'::timestamptz
    AND lesson.start_time BETWEEN '2026-09-29 18:10:00+03'::timestamptz
                              AND '2027-06-10 17:30:00+03'::timestamptz
    AND lesson.price = 31.00
    AND lesson.status IN ('active', 'completed')
    AND lesson.paid IS FALSE
    AND lesson.payment_status = 'pending'
    AND lesson.lesson_package_id IS NULL
    AND lesson.payment_batch_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.invoice_line_items line
      WHERE lesson.id = ANY(line.session_ids)
    );
  IF v_candidate_count > 74 THEN
    RAISE EXCEPTION 'Vakarė price correction aborted: found % candidates, expected at most 74', v_candidate_count;
  END IF;

  UPDATE public.sessions lesson
  SET price = 25.00
  WHERE lesson.student_id = v_student_id
    AND lesson.tutor_id = v_tutor_id
    AND lesson.subject_id = v_subject_id
    AND lesson.recurring_session_id IN (
      '1cdb4924-9b2a-4afa-88b0-e29e070e10a3'::uuid,
      '52e741e5-4e31-4617-ad6c-c699fa37a312'::uuid
    )
    AND lesson.created_at BETWEEN '2026-09-25 06:52:54.425784+03'::timestamptz
                              AND '2026-09-25 06:53:59.201231+03'::timestamptz
    AND lesson.start_time BETWEEN '2026-09-29 18:10:00+03'::timestamptz
                              AND '2027-06-10 17:30:00+03'::timestamptz
    AND lesson.price = 31.00
    AND lesson.status IN ('active', 'completed')
    AND lesson.paid IS FALSE
    AND lesson.payment_status = 'pending'
    AND lesson.lesson_package_id IS NULL
    AND lesson.payment_batch_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.invoice_line_items line
      WHERE lesson.id = ANY(line.session_ids)
    );
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Corrected % Vakarė lesson prices from 31 EUR to 25 EUR', v_updated_count;
END;
$price_correction$;

-- A pooled package freezes each quoted item's price. When payment attaches the
-- quoted calendar rows, bring their displayed session prices into line with
-- that sale. A credit later spent on another subject has no matching quote
-- item and keeps its existing session price.
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
            AND student.organization_id=NEW.pool_organization_id
            AND student.detached_at IS NULL
            AND package_student_identity(student)=NEW.pool_identity_key
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
