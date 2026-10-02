-- One organization sales invoice for a verified Stripe payment. Row locks make
-- the success page, webhook, and historical reconciliation safe to repeat.
CREATE OR REPLACE FUNCTION public.issue_proklase_paid_source_invoice(
  p_source_type text,
  p_source_id uuid,
  p_checkout_id text,
  p_base_amount numeric
)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  lesson public.sessions%ROWTYPE;
  package public.lesson_packages%ROWTYPE;
  student public.students%ROWTYPE;
  seller_profile public.invoice_profiles%ROWTYPE;
  ledger public.platform_fee_ledger%ROWTYPE;
  org_id uuid;
  tutor_id uuid;
  student_id uuid;
  package_id uuid;
  invoice_id uuid;
  existing_invoice public.invoices%ROWTYPE;
  source_amount numeric;
  paid_at timestamptz;
  period_day date;
  series text;
  allocated integer;
  seller jsonb;
  buyer jsonb;
  description text;
  lesson_ids uuid[];
  item_total numeric;
BEGIN
  IF p_source_type = 'session' THEN
    SELECT * INTO lesson FROM public.sessions WHERE id = p_source_id FOR UPDATE;
    IF NOT FOUND OR NOT coalesce(lesson.paid, false) OR coalesce(lesson.is_complimentary, false) THEN RETURN NULL; END IF;
    tutor_id := lesson.tutor_id;
    student_id := lesson.student_id;
    SELECT organization_id INTO org_id FROM public.profiles WHERE id = tutor_id;
  ELSIF p_source_type = 'package' THEN
    SELECT * INTO package FROM public.lesson_packages WHERE id = p_source_id FOR UPDATE;
    IF NOT FOUND OR NOT coalesce(package.paid, false) OR package.payment_status = 'cancelled' THEN RETURN NULL; END IF;
    tutor_id := package.tutor_id;
    student_id := package.student_id;
    SELECT coalesce(package.pool_organization_id, organization_id) INTO org_id FROM public.profiles WHERE id = tutor_id;
    package_id := package.id;
  ELSE
    RETURN NULL;
  END IF;

  IF org_id IS NULL OR org_id NOT IN (
    '3422031d-6e21-424d-980b-35a9c6d7b8f1'::uuid,
    'b0a00000-7e57-4000-8000-000000000001'::uuid
  ) THEN RETURN NULL; END IF;

  SELECT * INTO ledger FROM public.platform_fee_ledger
    WHERE source_type = p_source_type AND source_id = p_source_id AND provider = 'stripe';
  IF FOUND THEN
    IF ledger.organization_id IS DISTINCT FROM org_id OR upper(ledger.currency) <> 'EUR'
      OR (p_checkout_id IS NOT NULL AND p_checkout_id IS DISTINCT FROM ledger.stripe_checkout_session_id)
    THEN RAISE EXCEPTION 'Payment evidence does not match invoice source'; END IF;
    source_amount := round(ledger.base_amount, 2);
    paid_at := ledger.paid_at;
  ELSE
    -- API callers supply this only after verifying a paid Checkout with Stripe.
    -- This also covers checkouts whose payer fee is zero (no fee-ledger row).
    IF nullif(p_checkout_id, '') IS NULL THEN RETURN NULL; END IF;
    source_amount := round(p_base_amount, 2);
    paid_at := coalesce(package.paid_at, now());
  END IF;
  IF source_amount IS NULL OR source_amount <= 0 THEN RETURN NULL; END IF;

  IF p_source_type = 'session' AND lesson.lesson_package_id IS NOT NULL THEN
    SELECT * INTO package FROM public.lesson_packages WHERE id = lesson.lesson_package_id FOR UPDATE;
    IF NOT FOUND OR package.payment_status = 'cancelled' THEN RETURN NULL; END IF;
    IF package.student_id IS DISTINCT FROM student_id
      AND NOT coalesce(student_id = ANY(package.pool_student_ids), false)
    THEN RAISE EXCEPTION 'Package belongs to a different student'; END IF;
    -- An individual lesson checkout cannot settle a larger package's invoice.
    IF package.total_lessons <> 1 THEN RETURN NULL; END IF;
    package_id := package.id;
  END IF;

  SELECT * INTO seller_profile FROM public.invoice_profiles WHERE organization_id = org_id;
  IF NOT FOUND OR nullif(btrim(seller_profile.business_name), '') IS NULL
    OR nullif(btrim(seller_profile.company_code), '') IS NULL
  THEN RAISE EXCEPTION 'Organization invoice profile required'; END IF;
  SELECT * INTO student FROM public.students WHERE id = student_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice student missing'; END IF;

  seller := jsonb_strip_nulls(jsonb_build_object(
    'name', seller_profile.business_name,
    'entityType', seller_profile.entity_type,
    'companyCode', seller_profile.company_code,
    'vatCode', nullif(seller_profile.vat_code, ''),
    'address', seller_profile.address,
    'activityNumber', nullif(seller_profile.activity_number, ''),
    'contactEmail', seller_profile.contact_email,
    'contactPhone', seller_profile.contact_phone,
    'bankName', nullif(seller_profile.bank_name, ''),
    'iban', nullif(seller_profile.iban, ''),
    'taxExemptionNote', 'PVM neapmokestinama pagal LR PVMĮ 22 str.'
  ));
  buyer := jsonb_strip_nulls(jsonb_build_object(
    'name', coalesce(nullif(btrim(student.payer_name), ''), student.full_name, 'Mokinys'),
    'email', coalesce(nullif(btrim(student.payer_email), ''), nullif(btrim(student.email), ''))
  ));

  -- Respect invoices already issued for this customer payment, including
  -- manually issued package invoices. Tutor-pay invoices cannot match here.
  SELECT i.* INTO existing_invoice FROM public.invoices i
    WHERE i.organization_id = org_id AND i.seller_user_id IS NULL
      AND coalesce(i.pdf_meta->>'invoiceKind', '') <> 'tutor_pay'
      AND (i.source_session_id = CASE WHEN p_source_type = 'session' THEN p_source_id END
        OR i.id = package.manual_sales_invoice_id
        OR (i.status <> 'cancelled' AND EXISTS (
          SELECT 1 FROM public.invoice_line_items li WHERE li.invoice_id = i.id
            AND li.session_ids && array_remove(ARRAY[p_source_id, package_id], NULL)
        )))
      AND (i.seller_snapshot->>'companyCode' = seller_profile.company_code
        OR lower(btrim(i.seller_snapshot->>'name')) = lower(btrim(seller_profile.business_name)))
    ORDER BY (i.id = package.manual_sales_invoice_id) DESC NULLS LAST, i.created_at
    LIMIT 1;
  IF FOUND THEN
    IF existing_invoice.status = 'cancelled' THEN RETURN NULL; END IF;
    invoice_id := existing_invoice.id;
    -- A partial payment must not mark a larger, combined invoice fully paid.
    IF existing_invoice.total_amount <= source_amount + 0.005 THEN
      UPDATE public.invoices SET status = 'paid' WHERE id = invoice_id AND status = 'issued';
    END IF;
    IF package_id IS NOT NULL AND package.manual_sales_invoice_id IS NULL THEN
      UPDATE public.lesson_packages SET manual_sales_invoice_id = invoice_id WHERE id = package_id;
    END IF;
    RETURN invoice_id;
  END IF;
  IF package.manual_sales_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Linked invoice does not match organization seller';
  END IF;

  SELECT invoice_series, allocated_number INTO series, allocated
    FROM public.allocate_invoice_number(seller_profile.id);
  IF allocated IS NULL THEN RAISE EXCEPTION 'Invoice number allocation failed'; END IF;
  period_day := CASE WHEN p_source_type = 'session'
    THEN (lesson.start_time AT TIME ZONE 'Europe/Vilnius')::date
    ELSE (paid_at AT TIME ZONE 'Europe/Vilnius')::date END;
  INSERT INTO public.invoices(invoice_number, issued_by_user_id, organization_id, seller_user_id,
    seller_snapshot, buyer_snapshot, issue_date, period_start, period_end, grouping_type,
    subtotal, total_amount, status, source_session_id, pdf_meta)
  VALUES (coalesce(nullif(series, ''), 'SF') || '-' || CASE WHEN allocated < 1000 AND series <> 'MK'
      THEN lpad(allocated::text, 3, '0') ELSE allocated::text END,
    tutor_id, org_id, NULL, seller, buyer, CURRENT_DATE, period_day, period_day, 'single',
    source_amount, source_amount, 'paid', CASE WHEN p_source_type = 'session' THEN p_source_id END,
    jsonb_build_object('invoiceKind', 'customer_sale', 'paymentSourceType', p_source_type,
      'paymentSourceId', p_source_id, 'stripeCheckoutSessionId', coalesce(ledger.stripe_checkout_session_id, p_checkout_id),
      'paidAt', paid_at))
  RETURNING id INTO invoice_id;

  IF p_source_type = 'package' THEN
    SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO lesson_ids FROM public.sessions WHERE lesson_package_id = package_id;
    lesson_ids := ARRAY[package_id] || lesson_ids;
    SELECT round(sum(it.total_price), 2) INTO item_total FROM public.lesson_package_items it WHERE it.package_id = package.id;
    IF item_total = source_amount THEN
      INSERT INTO public.invoice_line_items(invoice_id, description, quantity, unit_price, total_price, session_ids)
      SELECT invoice_id, coalesce(s.name, 'Pamoka') || ' - pamokų paketas (' || it.total_lessons || ' pam.)',
        1, it.total_price, it.total_price, lesson_ids
      FROM public.lesson_package_items it LEFT JOIN public.subjects s ON s.id = it.subject_id
      WHERE it.package_id = package.id ORDER BY it.position;
    ELSE
      SELECT name INTO description FROM public.subjects WHERE id = package.subject_id;
      INSERT INTO public.invoice_line_items(invoice_id, description, quantity, unit_price, total_price, session_ids)
      VALUES (invoice_id, coalesce(description, 'Pamokos') || ' - pamokų paketas (' || package.total_lessons || ' pam.)',
        1, source_amount, source_amount, lesson_ids);
    END IF;
  ELSE
    SELECT name INTO description FROM public.subjects WHERE id = lesson.subject_id;
    INSERT INTO public.invoice_line_items(invoice_id, description, quantity, unit_price, total_price, session_ids)
    VALUES (invoice_id, coalesce(description, lesson.topic, 'Pamoka') || ' - ' || student.full_name || ' - ' || period_day,
      1, source_amount, source_amount, array_remove(ARRAY[p_source_id, package_id], NULL));
  END IF;
  IF package_id IS NOT NULL THEN
    UPDATE public.lesson_packages SET manual_sales_invoice_id = invoice_id WHERE id = package_id;
  END IF;
  RETURN invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_proklase_paid_source_invoice(text, uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_proklase_paid_source_invoice(text, uuid, text, numeric) TO service_role;
