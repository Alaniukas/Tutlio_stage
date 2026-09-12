-- One sales invoice per paid standalone trial, even when checkout return and
-- webhook execute concurrently. The invoice and its line are one transaction.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS source_session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payer_email_sent_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_source_session_unique ON public.invoices(source_session_id) WHERE source_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.issue_paid_trial_invoice(p_session_id uuid, p_seller jsonb, p_buyer jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  lesson public.sessions%ROWTYPE;
  org_id uuid;
  profile_id uuid;
  invoice_id uuid;
  series text;
  number integer;
  description text;
BEGIN
  SELECT * INTO lesson FROM public.sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE(lesson.paid, false) OR lesson.price <= 0 OR lesson.lesson_package_id IS NOT NULL THEN RETURN NULL; END IF;
  SELECT organization_id INTO org_id FROM public.profiles WHERE id = lesson.tutor_id;
  IF org_id IS NULL OR org_id NOT IN ('3422031d-6e21-424d-980b-35a9c6d7b8f1'::uuid, 'b0a00000-7e57-4000-8000-000000000001'::uuid) THEN RETURN NULL; END IF;
  SELECT name INTO description FROM public.subjects WHERE id = lesson.subject_id AND is_trial = true;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT id INTO invoice_id FROM public.invoices WHERE source_session_id = p_session_id;
  IF FOUND THEN RETURN invoice_id; END IF;
  -- Respect a sales invoice issued manually before payment, too.
  SELECT i.id INTO invoice_id FROM public.invoices i JOIN public.invoice_line_items li ON li.invoice_id = i.id
    WHERE i.organization_id = org_id AND i.status <> 'cancelled'
      AND li.session_ids @> ARRAY[p_session_id]
      AND (i.seller_snapshot->>'companyCode' = p_seller->>'companyCode'
        OR i.seller_snapshot->>'name' = p_seller->>'name') LIMIT 1;
  IF FOUND THEN
    UPDATE public.invoices SET source_session_id = p_session_id, status = 'paid' WHERE id = invoice_id;
    RETURN invoice_id;
  END IF;
  SELECT id INTO profile_id FROM public.invoice_profiles WHERE organization_id = org_id;
  IF profile_id IS NULL THEN RAISE EXCEPTION 'Organization invoice profile required'; END IF;
  SELECT invoice_series, allocated_number INTO series, number FROM public.allocate_invoice_number(profile_id);
  IF number IS NULL THEN RAISE EXCEPTION 'Invoice number allocation failed'; END IF;
  INSERT INTO public.invoices(invoice_number, issued_by_user_id, organization_id, seller_snapshot, buyer_snapshot,
    issue_date, period_start, period_end, grouping_type, subtotal, total_amount, status, source_session_id)
  VALUES (COALESCE(series, 'SF') || '-' || CASE WHEN number < 1000 AND series <> 'MK' THEN lpad(number::text, 3, '0') ELSE number::text END,
    lesson.tutor_id, org_id, p_seller, p_buyer, CURRENT_DATE, (lesson.start_time AT TIME ZONE 'Europe/Vilnius')::date,
    (lesson.start_time AT TIME ZONE 'Europe/Vilnius')::date, 'single', lesson.price, lesson.price, 'paid', p_session_id)
  RETURNING id INTO invoice_id;
  INSERT INTO public.invoice_line_items(invoice_id, description, quantity, unit_price, total_price, session_ids)
  VALUES (invoice_id, description, 1, lesson.price, lesson.price, ARRAY[p_session_id]);
  RETURN invoice_id;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_paid_trial_invoice(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_paid_trial_invoice(uuid, jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.issue_paid_trial_package_invoice(p_package_id uuid, p_seller jsonb, p_buyer jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  package public.lesson_packages%ROWTYPE;
  org_id uuid;
  profile_id uuid;
  invoice_id uuid;
  series text;
  number integer;
  description text;
  lesson_ids uuid[];
BEGIN
  SELECT * INTO package FROM public.lesson_packages WHERE id = p_package_id FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE(package.paid, false) OR package.total_price <= 0 THEN RETURN NULL; END IF;
  SELECT organization_id INTO org_id FROM public.profiles WHERE id = package.tutor_id;
  IF org_id IS NULL OR org_id NOT IN ('3422031d-6e21-424d-980b-35a9c6d7b8f1'::uuid, 'b0a00000-7e57-4000-8000-000000000001'::uuid) THEN RETURN NULL; END IF;
  SELECT name INTO description FROM public.subjects WHERE id = package.subject_id AND is_trial = true;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF package.manual_sales_invoice_id IS NOT NULL THEN
    UPDATE public.invoices SET status = 'paid' WHERE id = package.manual_sales_invoice_id AND status <> 'cancelled';
    RETURN package.manual_sales_invoice_id;
  END IF;
  SELECT id INTO profile_id FROM public.invoice_profiles WHERE organization_id = org_id;
  IF profile_id IS NULL THEN RAISE EXCEPTION 'Organization invoice profile required'; END IF;
  SELECT invoice_series, allocated_number INTO series, number FROM public.allocate_invoice_number(profile_id);
  IF number IS NULL THEN RAISE EXCEPTION 'Invoice number allocation failed'; END IF;
  INSERT INTO public.invoices(invoice_number, issued_by_user_id, organization_id, seller_snapshot, buyer_snapshot,
    issue_date, period_start, period_end, grouping_type, subtotal, total_amount, status)
  VALUES (COALESCE(series, 'SF') || '-' || CASE WHEN number < 1000 AND series <> 'MK' THEN lpad(number::text, 3, '0') ELSE number::text END,
    package.tutor_id, org_id, p_seller, p_buyer, CURRENT_DATE, CURRENT_DATE, CURRENT_DATE, 'single', package.total_price, package.total_price, 'paid')
  RETURNING id INTO invoice_id;
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO lesson_ids FROM public.sessions WHERE lesson_package_id = p_package_id;
  INSERT INTO public.invoice_line_items(invoice_id, description, quantity, unit_price, total_price, session_ids)
  VALUES (invoice_id, description, 1, package.total_price, package.total_price, lesson_ids);
  UPDATE public.lesson_packages SET manual_sales_invoice_id = invoice_id WHERE id = p_package_id;
  RETURN invoice_id;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_paid_trial_package_invoice(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_paid_trial_package_invoice(uuid, jsonb, jsonb) TO service_role;
