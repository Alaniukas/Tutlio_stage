-- Service-only transaction: keep the old document until its replacement and
-- all source lines exist. A stale confirmation or failed INSERT rolls back.
CREATE FUNCTION public.replace_school_invoices(
  p_kind text, p_organization_id uuid, p_tutor_id uuid,
  p_previous jsonb, p_invoice jsonb, p_lines jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_expected jsonb; v_old jsonb; v_ids uuid[]; v_id uuid := gen_random_uuid();
  v_sessions uuid[]; v_attendance uuid[]; v_students uuid[]; v_result jsonb;
BEGIN
  IF p_kind NOT IN ('tutor','payer') OR jsonb_array_length(p_previous)=0
    OR jsonb_array_length(p_lines)=0 OR (p_invoice->>'organization_id')::uuid IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'Invalid invoice replacement';
  END IF;
  -- Serialize replacements for this school, including two browser tabs.
  PERFORM id FROM public.organizations WHERE id=p_organization_id AND entity_type='school' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found'; END IF;
  SELECT array_agg((i->>'id')::uuid) INTO v_ids FROM jsonb_array_elements(p_previous) i;
  SELECT coalesce(array_agg(DISTINCT s::uuid),'{}') INTO v_sessions
    FROM jsonb_array_elements(p_lines) li CROSS JOIN LATERAL jsonb_array_elements_text(li->'session_ids') s;

  FOR v_expected IN SELECT value FROM jsonb_array_elements(p_previous) ORDER BY value->>'id' LOOP
    v_old := NULL;
    IF p_kind='tutor' THEN
      SELECT to_jsonb(i) INTO v_old FROM public.invoices i WHERE id=(v_expected->>'id')::uuid FOR UPDATE;
      IF v_old->>'status' IS DISTINCT FROM 'issued' OR v_old->'pdf_meta'->>'invoiceKind' IS DISTINCT FROM 'tutor_pay'
        OR v_old->'pdf_meta'->>'tutorId' IS DISTINCT FROM p_tutor_id::text
        OR v_old->>'billing_batch_id' IS NOT NULL THEN RAISE EXCEPTION 'Invoice cannot be regenerated'; END IF;
    ELSE
      SELECT to_jsonb(i) INTO v_old FROM public.school_monthly_invoices i WHERE id=(v_expected->>'id')::uuid FOR UPDATE;
      SELECT array_agg(s::uuid) INTO v_students FROM jsonb_array_elements_text(p_invoice->'payer_student_ids') s;
      IF v_old->>'payment_status' IS DISTINCT FROM 'pending' OR v_old->>'billing_model' IS DISTINCT FROM 'actual'
        OR v_old->>'contract_id' IS NOT NULL OR coalesce(v_old->>'stripe_checkout_session_id','')<>''
        OR coalesce((v_old->>'credit_applied_eur')::numeric,0)>0
        OR NOT coalesce(ARRAY(SELECT s::uuid FROM jsonb_array_elements_text(v_old->'payer_student_ids') s),ARRAY[(v_old->>'student_id')::uuid]) <@ v_students
        OR NOT (v_old->>'student_id')::uuid=ANY(v_students) THEN
        RAISE EXCEPTION 'Invoice cannot be regenerated';
      END IF;
    END IF;
    IF v_old IS NULL OR v_old->>'organization_id' IS DISTINCT FROM p_organization_id::text
      OR v_old->>'period_start' IS DISTINCT FROM p_invoice->>'period_start'
      OR v_old->>'period_end' IS DISTINCT FROM p_invoice->>'period_end'
      OR NOT (v_expected - 'lines') <@ v_old THEN
      RAISE EXCEPTION 'Sąskaitos duomenys pasikeitė. Peržiūrėkite ją dar kartą.';
    END IF;
  END LOOP;

  IF p_kind='tutor' THEN
    IF p_invoice->'pdf_meta'->>'tutorId' IS DISTINCT FROM p_tutor_id::text
      OR p_invoice->'pdf_meta'->>'invoiceKind' IS DISTINCT FROM 'tutor_pay' THEN RAISE EXCEPTION 'Invalid beneficiary'; END IF;
    UPDATE public.invoices SET status='cancelled' WHERE id=ANY(v_ids);
    SELECT coalesce(array_agg(DISTINCT a::uuid),'{}') INTO v_attendance
      FROM jsonb_array_elements(p_lines) li CROSS JOIN LATERAL jsonb_array_elements_text(li->'school_attendance_ids') a;
    IF EXISTS (SELECT 1 FROM public.invoices i WHERE i.organization_id=p_organization_id AND i.status<>'cancelled'
      AND i.pdf_meta->>'invoiceKind'='tutor_pay' AND i.pdf_meta->>'tutorId'=p_tutor_id::text
      AND (EXISTS (SELECT 1 FROM public.invoice_line_items li WHERE li.invoice_id=i.id
        AND (li.session_ids && v_sessions OR li.school_attendance_ids && v_attendance))
        OR (i.pdf_meta->'schoolMeetingKeys') ?| ARRAY(SELECT jsonb_array_elements_text(p_invoice->'pdf_meta'->'schoolMeetingKeys')))) THEN
      RAISE EXCEPTION 'Užsiėmimai jau įtraukti į kitą sąskaitą. Atnaujinkite peržiūrą.';
    END IF;
    INSERT INTO public.invoices(id,invoice_number,issued_by_user_id,organization_id,seller_user_id,seller_snapshot,buyer_snapshot,
      issue_date,period_start,period_end,grouping_type,subtotal,total_amount,status,origin,pdf_meta)
    SELECT v_id,x.invoice_number,x.issued_by_user_id,p_organization_id,x.seller_user_id,x.seller_snapshot,x.buyer_snapshot,
      x.issue_date,x.period_start,x.period_end,x.grouping_type,x.subtotal,x.total_amount,'issued','generated',x.pdf_meta
    FROM jsonb_populate_record(NULL::public.invoices,p_invoice) x;
    INSERT INTO public.invoice_line_items(invoice_id,description,quantity,unit_price,total_price,session_ids,school_attendance_ids)
    SELECT v_id,x.description,x.quantity,x.unit_price,x.total_price,x.session_ids,x.school_attendance_ids
      FROM jsonb_populate_recordset(NULL::public.invoice_line_items,p_lines) x;
    SELECT to_jsonb(i) INTO v_result FROM public.invoices i WHERE id=v_id;
  ELSE
    UPDATE public.school_monthly_invoices SET payment_status='cancelled' WHERE id=ANY(v_ids);
    IF EXISTS (SELECT 1 FROM public.school_monthly_invoices i WHERE i.organization_id=p_organization_id
      AND i.payment_status<>'cancelled' AND (i.billed_session_ids && v_sessions OR i.extra_session_ids && v_sessions
        OR EXISTS (SELECT 1 FROM public.school_monthly_invoice_lines li WHERE li.invoice_id=i.id
          AND (li.session_ids && v_sessions OR li.session_id=ANY(v_sessions))))) THEN
      RAISE EXCEPTION 'Užsiėmimai jau įtraukti į kitą sąskaitą. Atnaujinkite peržiūrą.';
    END IF;
    INSERT INTO public.school_monthly_invoices(id,organization_id,contract_id,student_id,period_start,period_end,unit_price_eur,
      base_lessons,base_amount_eur,extra_lessons,extra_amount_eur,subtotal_eur,discount_amount_eur,discount_note,total_eur,
      credit_preview_eur,payer_student_ids,extra_session_ids,billing_model,billed_session_ids,payment_status,due_date,invoice_number)
    SELECT v_id,p_organization_id,NULL,x.student_id,x.period_start,x.period_end,0,0,0,0,0,x.subtotal_eur,x.discount_amount_eur,
      x.discount_note,x.total_eur,x.credit_preview_eur,x.payer_student_ids,'{}','actual',x.billed_session_ids,'pending',x.due_date,x.invoice_number
    FROM jsonb_populate_record(NULL::public.school_monthly_invoices,p_invoice) x;
    INSERT INTO public.school_monthly_invoice_lines(invoice_id,sort_order,description,unit_price_eur,quantity,original_amount_eur,
      discount_type,discount_value,discount_amount_eur,discount_note,amount_eur,source,consultation_id,session_id,session_ids)
    SELECT v_id,x.sort_order,x.description,x.unit_price_eur,x.quantity,x.original_amount_eur,x.discount_type,x.discount_value,
      x.discount_amount_eur,x.discount_note,x.amount_eur,x.source,x.consultation_id,x.session_id,x.session_ids
    FROM jsonb_populate_recordset(NULL::public.school_monthly_invoice_lines,p_lines) x;
    SELECT to_jsonb(i) INTO v_result FROM public.school_monthly_invoices i WHERE id=v_id;
  END IF;
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.replace_school_invoices(text,uuid,uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_school_invoices(text,uuid,uuid,jsonb,jsonb,jsonb) TO service_role;
