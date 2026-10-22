-- Authorized customer-data repair only; not a schema migration.
-- Reserve the already-paid trial credit for the exact October 22 lesson.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
DO $repair$
DECLARE
  child public.students;
  lesson public.sessions;
  package public.lesson_packages;
  item public.lesson_package_items;
  invoice_before jsonb;
  lines_before jsonb;
  other_lessons_before jsonb;
  lesson_before jsonb;
  package_before jsonb;
  item_before jsonb;
  package_subject constant uuid := 'f6a36590-9a58-4c08-8ce5-4fd2f8913645';
BEGIN
  SELECT * INTO STRICT child FROM public.students
    WHERE id = '19c2a1e4-ec13-4953-9b59-a1dd3a4d9536' FOR UPDATE;
  IF child.organization_id IS DISTINCT FROM '3422031d-6e21-424d-980b-35a9c6d7b8f1'::uuid
     OR child.tutor_id IS DISTINCT FROM '2f549baf-5811-42dd-8cf9-90b6e0dd0543'::uuid
     OR child.linked_user_id IS DISTINCT FROM '0caf7ad4-36c7-4b73-9d15-e2ef24974b76'::uuid
     OR child.detached_at IS NOT NULL THEN
    RAISE EXCEPTION 'Gabija trial repair: student identity changed';
  END IF;
  PERFORM 1 FROM public.profiles WHERE id = child.tutor_id AND organization_id = child.organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gabija trial repair: tutor organization changed'; END IF;

  SELECT * INTO STRICT package FROM public.lesson_packages
    WHERE id = '6d969735-bede-4575-a980-a65c549ced35' FOR UPDATE;
  SELECT * INTO STRICT item FROM public.lesson_package_items
    WHERE id = '40801108-3940-46bf-8529-d30aa5010f60' FOR UPDATE;
  SELECT * INTO STRICT lesson FROM public.sessions
    WHERE id = 'c3f95c8b-fa4f-4b01-8f9a-378de6ef58a0' FOR UPDATE;

  IF package.student_id IS DISTINCT FROM child.id OR package.tutor_id IS DISTINCT FROM child.tutor_id
     OR package.subject_id IS DISTINCT FROM package_subject OR package.pool_organization_id IS NOT NULL
     OR package.paid IS DISTINCT FROM true OR package.payment_status IS DISTINCT FROM 'paid'
     OR package.active IS DISTINCT FROM true OR package.total_lessons IS DISTINCT FROM 1
     OR package.total_price IS DISTINCT FROM 10 OR package.price_per_lesson IS DISTINCT FROM 10
     OR package.manual_sales_invoice_id IS DISTINCT FROM 'f5bcd8f1-fd3d-45ff-8720-f07d402744b6'::uuid
     OR package.expires_at <= clock_timestamp()
     OR item.package_id IS DISTINCT FROM package.id OR item.subject_id IS DISTINCT FROM package_subject
     OR item.total_lessons IS DISTINCT FROM 1 OR item.total_price IS DISTINCT FROM 10
     OR item.price_per_lesson IS DISTINCT FROM 10
     OR (SELECT count(*) FROM public.lesson_package_items WHERE package_id = package.id) <> 1 THEN
    RAISE EXCEPTION 'Gabija trial repair: paid package or item changed';
  END IF;
  PERFORM 1 FROM public.subjects WHERE id = package_subject AND tutor_id = child.tutor_id
    AND is_trial = true AND price = 10 AND duration_minutes = 45;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gabija trial repair: purchased trial subject changed'; END IF;

  SELECT to_jsonb(i) INTO STRICT invoice_before FROM public.invoices i
    WHERE id = package.manual_sales_invoice_id AND organization_id = child.organization_id
      AND status = 'paid' AND total_amount = 10.41
      AND pdf_meta->>'invoiceKind' = 'customer_sale'
      AND pdf_meta->>'paymentSourceType' = 'package'
      AND pdf_meta->>'paymentSourceId' = package.id::text FOR UPDATE;
  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id), '[]'::jsonb) INTO lines_before
    FROM public.invoice_line_items i WHERE invoice_id = package.manual_sales_invoice_id;
  IF lesson.student_id IS DISTINCT FROM child.id OR lesson.tutor_id IS DISTINCT FROM child.tutor_id
     OR lesson.status IS DISTINCT FROM 'active' OR lesson.paid IS DISTINCT FROM true
     OR lesson.payment_status IS DISTINCT FROM 'paid' OR lesson.price IS DISTINCT FROM 10
     OR lesson.start_time IS DISTINCT FROM timestamptz '2026-10-22 16:55:00+03'
     OR lesson.end_time IS DISTINCT FROM timestamptz '2026-10-22 17:40:00+03'
     OR lesson.status_confirmed_at IS NOT NULL OR lesson.student_joined_at IS NOT NULL
     OR lesson.tutor_joined_at IS NOT NULL OR coalesce(lesson.is_complimentary, false)
     OR coalesce(lesson.is_makeup, false) OR lesson.class_group_id IS NOT NULL
     OR lesson.stripe_checkout_session_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.payments WHERE session_id = lesson.id)
     OR EXISTS (SELECT 1 FROM public.invoices WHERE source_session_id = lesson.id)
     OR EXISTS (SELECT 1 FROM public.invoice_line_items WHERE lesson.id = ANY(session_ids))
     OR EXISTS (SELECT 1 FROM public.sessions WHERE lesson_package_id = package.id AND id <> lesson.id) THEN
    RAISE EXCEPTION 'Gabija trial repair: lesson or payment evidence changed';
  END IF;

  IF lesson.lesson_package_id = package.id AND lesson.subject_id = package_subject
     AND package.available_lessons = 0 AND package.reserved_lessons = 1 AND package.completed_lessons = 0
     AND item.available_lessons = 0 AND item.reserved_lessons = 1 AND item.completed_lessons = 0 THEN
    RAISE NOTICE 'Gabija trial package is already assigned';
    RETURN;
  END IF;
  IF lesson.start_time <= clock_timestamp() OR lesson.lesson_package_id IS NOT NULL
     OR lesson.subject_id IS DISTINCT FROM '5d12aa35-bfc3-459a-8886-e540166ba3df'::uuid
     OR package.available_lessons IS DISTINCT FROM 1 OR package.reserved_lessons IS DISTINCT FROM 0
     OR package.completed_lessons IS DISTINCT FROM 0 OR item.available_lessons IS DISTINCT FROM 1
     OR item.reserved_lessons IS DISTINCT FROM 0 OR item.completed_lessons IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Gabija trial repair: original unallocated credit state changed';
  END IF;
  lesson_before := to_jsonb(lesson) - ARRAY['subject_id', 'lesson_package_id'];
  package_before := to_jsonb(package) - ARRAY['available_lessons', 'reserved_lessons'];
  item_before := to_jsonb(item) - ARRAY['available_lessons', 'reserved_lessons'];
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id), '[]'::jsonb) INTO other_lessons_before
    FROM public.sessions s WHERE student_id = child.id AND id <> lesson.id;

  -- Use the purchased subject ID so later completion/cancellation updates the
  -- same package item. Both subjects are the same tutor's €10/45-minute trial.
  UPDATE public.sessions SET lesson_package_id = package.id, subject_id = package_subject WHERE id = lesson.id;
  UPDATE public.lesson_packages SET available_lessons = 0, reserved_lessons = 1 WHERE id = package.id;
  UPDATE public.lesson_package_items SET available_lessons = 0, reserved_lessons = 1 WHERE id = item.id;

  IF (SELECT to_jsonb(s) - ARRAY['subject_id', 'lesson_package_id'] FROM public.sessions s WHERE id = lesson.id)
       IS DISTINCT FROM lesson_before
     OR (SELECT to_jsonb(p) - ARRAY['available_lessons', 'reserved_lessons'] FROM public.lesson_packages p WHERE id = package.id)
       IS DISTINCT FROM package_before
     OR (SELECT to_jsonb(i) - ARRAY['available_lessons', 'reserved_lessons'] FROM public.lesson_package_items i WHERE id = item.id)
       IS DISTINCT FROM item_before
     OR (SELECT to_jsonb(i) FROM public.invoices i WHERE id = package.manual_sales_invoice_id) IS DISTINCT FROM invoice_before
     OR (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id), '[]'::jsonb) FROM public.invoice_line_items i
         WHERE invoice_id = package.manual_sales_invoice_id) IS DISTINCT FROM lines_before
     OR (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id), '[]'::jsonb) FROM public.sessions s
         WHERE student_id = child.id AND id <> lesson.id) IS DISTINCT FROM other_lessons_before THEN
    RAISE EXCEPTION 'Gabija trial repair: unrelated or immutable data changed';
  END IF;
  PERFORM 1 FROM public.sessions s JOIN public.lesson_packages p ON p.id = s.lesson_package_id
    JOIN public.lesson_package_items i ON i.package_id = p.id AND i.subject_id = s.subject_id
    WHERE s.id = lesson.id AND p.id = package.id AND i.id = item.id
      AND s.subject_id = package_subject AND p.available_lessons = 0 AND p.reserved_lessons = 1
      AND i.available_lessons = 0 AND i.reserved_lessons = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gabija trial repair: final allocation check failed'; END IF;
END;
$repair$;
COMMIT;
