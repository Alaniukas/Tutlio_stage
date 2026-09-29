-- Existing Mano Korepetitorius reservations created before billing-owner flags
-- were applied can be marked pending even though clients pay by monthly invoice.
-- Repair only future, unpaid, unbilled lessons that have no per-lesson model.
UPDATE public.sessions AS sess
SET payment_status = 'confirmed'
FROM public.students AS student,
     public.profiles AS tutor,
     public.organizations AS org
WHERE sess.student_id = student.id
  AND sess.tutor_id = tutor.id
  AND tutor.organization_id = org.id
  AND org.id = '2c4e4c2a-4e12-44ca-b327-d605bbb0d50b'::uuid
  AND org.enable_monthly_billing IS TRUE
  AND org.enable_per_lesson IS FALSE
  AND sess.status = 'active'
  AND sess.start_time > now()
  AND sess.paid IS FALSE
  AND sess.payment_status = 'pending'
  AND sess.payment_batch_id IS NULL
  AND sess.lesson_package_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.invoices AS invoice
    WHERE invoice.source_session_id = sess.id
      AND invoice.status IS DISTINCT FROM 'cancelled'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.invoice_line_items AS item
    JOIN public.invoices AS invoice ON invoice.id = item.invoice_id
    WHERE sess.id = ANY(item.session_ids)
      AND invoice.status IS DISTINCT FROM 'cancelled'
  )
  AND (
    NULLIF(btrim(student.payment_model), '') IS NULL
    OR (
      'monthly_billing' = ANY(string_to_array(student.payment_model, ','))
      AND NOT ('per_lesson' = ANY(string_to_array(student.payment_model, ',')))
    )
  );
