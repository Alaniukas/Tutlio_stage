-- Save the invoice, its lines, package link and number in one short transaction.
-- Both the verified payment return and Stripe webhook retry this same operation.
CREATE OR REPLACE FUNCTION public.issue_paid_source_sales_invoice(
  p_source_type text,
  p_source_id uuid,
  p_checkout_id text,
  p_base_amount numeric,
  p_currency text DEFAULT 'EUR'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  lesson public.sessions%ROWTYPE;
  package public.lesson_packages%ROWTYPE;
  student public.students%ROWTYPE;
  tutor public.profiles%ROWTYPE;
  organization public.organizations%ROWTYPE;
  seller_profile public.invoice_profiles%ROWTYPE;
  ledger public.platform_fee_ledger%ROWTYPE;
  org_id uuid;
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
  meta jsonb;
  seller_name text;
  description text;
  lesson_ids uuid[];
  item_total numeric;
  currency text := upper(p_currency);
  education_layout boolean := false;
  pro_klase boolean := false;
BEGIN
  IF p_source_type = 'session' THEN
    SELECT * INTO lesson FROM public.sessions WHERE id = p_source_id FOR UPDATE;
    IF NOT FOUND OR NOT coalesce(lesson.paid, false) OR coalesce(lesson.is_complimentary, false) THEN RETURN NULL; END IF;
    SELECT * INTO tutor FROM public.profiles WHERE id = lesson.tutor_id;
    student_id := lesson.student_id;
    org_id := tutor.organization_id;
    -- Solo tutors issue lesson invoices through their existing invoice workflow.
    IF org_id IS NULL THEN RETURN NULL; END IF;
  ELSIF p_source_type = 'package' THEN
    SELECT * INTO package FROM public.lesson_packages WHERE id = p_source_id FOR UPDATE;
    IF NOT FOUND OR NOT coalesce(package.paid, false) OR package.payment_status = 'cancelled' THEN RETURN NULL; END IF;
    SELECT * INTO tutor FROM public.profiles WHERE id = package.tutor_id;
    student_id := package.student_id;
    org_id := coalesce(package.pool_organization_id, tutor.organization_id);
    package_id := package.id;
  ELSE
    RETURN NULL;
  END IF;
  IF tutor.id IS NULL THEN RAISE EXCEPTION 'Invoice tutor missing'; END IF;
  IF org_id IS NOT NULL THEN
    SELECT * INTO organization FROM public.organizations WHERE id = org_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice organization missing'; END IF;
    -- School lesson charges belong to their contract/monthly invoice flow.
    IF p_source_type = 'session' AND organization.entity_type = 'school' THEN RETURN NULL; END IF;
  END IF;
  IF currency IS NULL OR currency NOT IN ('EUR', 'PLN') THEN RAISE EXCEPTION 'Unsupported invoice currency'; END IF;

  SELECT * INTO ledger FROM public.platform_fee_ledger
    WHERE source_type = p_source_type AND source_id = p_source_id AND provider = 'stripe';
  IF FOUND THEN
    IF ledger.organization_id IS DISTINCT FROM org_id OR upper(ledger.currency) IS DISTINCT FROM currency
      OR (p_checkout_id IS NOT NULL AND p_checkout_id IS DISTINCT FROM ledger.stripe_checkout_session_id)
    THEN RAISE EXCEPTION 'Payment evidence does not match invoice source'; END IF;
    source_amount := round(ledger.base_amount, 2);
    paid_at := ledger.paid_at;
  ELSE
    -- Only service-role API callers with verified paid Stripe evidence may call
    -- this fallback, including zero-fee payments with no platform fee ledger row.
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
    IF package.total_lessons <> 1 THEN RETURN NULL; END IF;
    IF coalesce(package.pool_organization_id, tutor.organization_id) IS DISTINCT FROM org_id THEN
      RAISE EXCEPTION 'Package belongs to a different organization';
    END IF;
    package_id := package.id;
  END IF;

  IF org_id IS NOT NULL THEN
    SELECT * INTO seller_profile FROM public.invoice_profiles WHERE organization_id = org_id;
  ELSE
    SELECT * INTO seller_profile FROM public.invoice_profiles WHERE user_id = tutor.id AND organization_id IS NULL;
  END IF;
  -- Match the required fields enforced by invoice-settings and the admin UI.
  IF seller_profile.id IS NULL OR nullif(btrim(seller_profile.entity_type), '') IS NULL
    OR (seller_profile.entity_type IN ('mb', 'uab', 'ii') AND (
      nullif(btrim(seller_profile.business_name), '') IS NULL
      OR nullif(btrim(seller_profile.company_code), '') IS NULL
      OR nullif(btrim(seller_profile.address), '') IS NULL))
    OR (seller_profile.entity_type NOT IN ('mb', 'uab', 'ii') AND nullif(btrim(seller_profile.activity_number), '') IS NULL)
    OR (nullif(btrim(seller_profile.contact_email), '') IS NULL AND nullif(btrim(seller_profile.contact_phone), '') IS NULL)
  THEN RAISE SQLSTATE 'PT422' USING MESSAGE = 'INVOICE_PROFILE_INCOMPLETE'; END IF;
  SELECT * INTO student FROM public.students WHERE id = student_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice student missing'; END IF;

  seller_name := CASE WHEN org_id IS NOT NULL OR seller_profile.entity_type IN ('mb', 'uab', 'ii')
    THEN seller_profile.business_name ELSE coalesce(nullif(btrim(tutor.full_name), ''), seller_profile.business_name) END;
  IF nullif(btrim(seller_name), '') IS NULL THEN RAISE SQLSTATE 'PT422' USING MESSAGE = 'INVOICE_PROFILE_INCOMPLETE'; END IF;
  education_layout := currency = 'EUR' AND coalesce(organization.features->'pvm_education_invoice' = 'true'::jsonb, false);
  pro_klase := org_id IN ('3422031d-6e21-424d-980b-35a9c6d7b8f1'::uuid, 'b0a00000-7e57-4000-8000-000000000001'::uuid);
  seller := jsonb_strip_nulls(jsonb_build_object(
    'name', seller_name, 'entityType', seller_profile.entity_type,
    'companyCode', nullif(seller_profile.company_code, ''), 'vatCode', nullif(seller_profile.vat_code, ''),
    'address', seller_profile.address, 'activityNumber', nullif(seller_profile.activity_number, ''),
    'personalCode', CASE WHEN org_id IS NULL THEN nullif(seller_profile.personal_code, '') END,
    'contactEmail', seller_profile.contact_email, 'contactPhone', seller_profile.contact_phone,
    'bankName', nullif(seller_profile.bank_name, ''), 'iban', nullif(seller_profile.iban, ''),
    'taxExemptionNote', CASE WHEN education_layout OR (pro_klase AND currency = 'EUR')
      THEN 'PVM neapmokestinama pagal LR PVMĮ 22 str.' END
  ));
  buyer := jsonb_strip_nulls(jsonb_build_object(
    'name', coalesce(nullif(btrim(student.payer_name), ''), student.full_name, 'Mokinys'),
    'email', coalesce(nullif(btrim(student.payer_email), ''), nullif(btrim(student.email), ''))
  ));

  -- Customer invoices only, with the same seller and charge currency. Never
  -- expose/reuse a tutor remuneration invoice or an invoice from another tenant.
  SELECT i.* INTO existing_invoice FROM public.invoices i
    WHERE i.organization_id IS NOT DISTINCT FROM org_id
      AND i.seller_user_id IS NOT DISTINCT FROM CASE WHEN org_id IS NULL THEN tutor.id END
      AND coalesce(i.pdf_meta->>'invoiceKind', '') <> 'tutor_pay'
      AND (i.source_session_id = CASE WHEN p_source_type = 'session' THEN p_source_id END
        OR i.id = package.manual_sales_invoice_id
        OR (i.status <> 'cancelled' AND EXISTS (
          SELECT 1 FROM public.invoice_line_items li WHERE li.invoice_id = i.id
            AND li.session_ids && array_remove(ARRAY[p_source_id, package_id], NULL)
        )))
      AND CASE WHEN nullif(seller_profile.company_code, '') IS NOT NULL
          AND nullif(i.seller_snapshot->>'companyCode', '') IS NOT NULL
        THEN i.seller_snapshot->>'companyCode' = seller_profile.company_code
        ELSE lower(btrim(i.seller_snapshot->>'name')) = lower(btrim(seller_name)) END
    ORDER BY (i.id = package.manual_sales_invoice_id) DESC NULLS LAST, i.created_at
    LIMIT 1;
  IF FOUND THEN
    IF existing_invoice.status = 'cancelled' THEN RETURN NULL; END IF;
    IF upper(coalesce(existing_invoice.pdf_meta->>'currency', 'EUR')) <> currency THEN
      RAISE EXCEPTION 'Linked invoice currency does not match payment';
    END IF;
    invoice_id := existing_invoice.id;
    IF existing_invoice.total_amount <= source_amount + 0.005 THEN
      UPDATE public.invoices SET status = 'paid' WHERE id = invoice_id AND status = 'issued';
    END IF;
    IF package_id IS NOT NULL AND package.manual_sales_invoice_id IS NULL THEN
      UPDATE public.lesson_packages SET manual_sales_invoice_id = invoice_id WHERE id = package_id;
    END IF;
    RETURN invoice_id;
  END IF;
  IF package.manual_sales_invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Linked invoice does not match seller'; END IF;

  SELECT invoice_series, allocated_number INTO series, allocated FROM public.allocate_invoice_number(seller_profile.id);
  IF allocated IS NULL OR allocated < 1 THEN RAISE EXCEPTION 'Invoice number allocation failed'; END IF;
  series := coalesce(nullif(upper(btrim(series)), ''), 'SF');
  period_day := CASE WHEN p_source_type = 'session' THEN (lesson.start_time AT TIME ZONE 'Europe/Vilnius')::date
    ELSE (paid_at AT TIME ZONE 'Europe/Vilnius')::date END;
  meta := jsonb_build_object('invoiceKind', 'customer_sale', 'paymentSourceType', p_source_type,
    'paymentSourceId', p_source_id, 'stripeCheckoutSessionId', coalesce(ledger.stripe_checkout_session_id, p_checkout_id),
    'paidAt', paid_at, 'currency', currency);
  IF education_layout THEN
    meta := meta || jsonb_build_object('layout', 'pvm_education', 'hidePlatformFooter', true, 'lessonDetails', '[]'::jsonb,
      'notes', jsonb_build_array('Pastaba: Mokymo paslaugos pagal bendrojo ugdymo programas suteiktos mokiniui ' || student.full_name || '.',
        'Sąskaita išrašyta vadovaujantis LR PVM įstatymo 22 straipsniu.'));
  END IF;
  INSERT INTO public.invoices(invoice_number, issued_by_user_id, organization_id, seller_user_id,
    seller_snapshot, buyer_snapshot, issue_date, period_start, period_end, grouping_type,
    subtotal, total_amount, status, source_session_id, pdf_meta)
  VALUES (coalesce(nullif(series, ''), 'SF') || '-' || CASE WHEN allocated < 1000 AND series <> 'MK'
      THEN lpad(allocated::text, 3, '0') ELSE allocated::text END,
    tutor.id, org_id, CASE WHEN org_id IS NULL THEN tutor.id END, seller, buyer, CURRENT_DATE, period_day, period_day, 'single',
    source_amount, source_amount, 'paid', CASE WHEN p_source_type = 'session' THEN p_source_id END, meta)
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

REVOKE ALL ON FUNCTION public.issue_paid_source_sales_invoice(text, uuid, text, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_paid_source_sales_invoice(text, uuid, text, numeric, text) TO service_role;
