-- Service-only operations. The API authorizes the organization and finance permission.
-- Existing invoice numbers, payment states and lesson records are not rewritten.
CREATE OR REPLACE FUNCTION public.allocate_org_tutor_invoice_number(
  p_organization_id uuid, p_profile_id uuid, p_default_series text
) RETURNS TABLE(invoice_series text, allocated_number int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile public.invoice_profiles; v_base text; v_series text; v_suffix int := 1; v_number int; v_stored text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('org-tutor-invoices:' || p_organization_id::text, 0));
  SELECT ip.* INTO v_profile FROM public.invoice_profiles ip
    JOIN public.profiles p ON p.id=ip.user_id
    WHERE ip.id=p_profile_id AND p.organization_id=p_organization_id FOR UPDATE OF ip;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tutor invoice profile not in organization'; END IF;
  v_base := upper(btrim(coalesce(nullif(v_profile.invoice_series, ''), 'SF')));
  IF v_base='SF' THEN v_base := upper(btrim(coalesce(nullif(p_default_series, ''), 'KOR'))); END IF;
  v_series := v_base;
  WHILE EXISTS (SELECT 1 FROM public.invoice_profiles ip JOIN public.profiles p ON p.id=ip.user_id
    WHERE p.organization_id=p_organization_id AND ip.id<>p_profile_id AND upper(ip.invoice_series)=v_series)
    OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.organization_id=p_organization_id
      AND coalesce(i.pdf_meta->>'tutorId', '')<>v_profile.user_id::text
      AND upper(regexp_replace(i.invoice_number, '-[0-9]+$', ''))=v_series)
  LOOP v_suffix := v_suffix+1; v_series := v_base || v_suffix::text; END LOOP;
  v_number := greatest(coalesce(v_profile.next_invoice_number, 1), 1);
  LOOP
    v_stored := v_series || '-' || CASE WHEN v_series='MK' OR v_number>=1000 THEN v_number::text ELSE lpad(v_number::text,3,'0') END;
    EXIT WHEN NOT EXISTS(SELECT 1 FROM public.invoices i WHERE i.organization_id=p_organization_id AND upper(i.invoice_number)=v_stored);
    v_number := v_number+1;
  END LOOP;
  UPDATE public.invoice_profiles SET invoice_series=v_series, next_invoice_number=v_number+1, updated_at=now() WHERE id=p_profile_id;
  RETURN QUERY SELECT v_series,v_number;
END; $$;

CREATE OR REPLACE FUNCTION public.create_org_tutor_pay_invoice(
  p_organization_id uuid, p_tutor_id uuid, p_invoice jsonb, p_lines jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_invoice public.invoices; v_id uuid := gen_random_uuid(); v_sessions uuid[]; v_adjustments text[]; v_result jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('org-tutor-invoices:' || p_organization_id::text, 0));
  SELECT * INTO v_invoice FROM jsonb_populate_record(NULL::public.invoices,p_invoice);
  IF v_invoice.organization_id IS DISTINCT FROM p_organization_id OR v_invoice.seller_user_id IS DISTINCT FROM p_tutor_id
    OR v_invoice.pdf_meta->>'invoiceKind' IS DISTINCT FROM 'tutor_pay' OR v_invoice.pdf_meta->>'tutorId' IS DISTINCT FROM p_tutor_id::text
  THEN RAISE EXCEPTION 'Invalid tutor invoice ownership'; END IF;
  SELECT coalesce(array_agg(DISTINCT sid), '{}') INTO v_sessions
    FROM jsonb_populate_recordset(NULL::public.invoice_line_items,p_lines) li CROSS JOIN LATERAL unnest(li.session_ids) sid;
  IF EXISTS(SELECT 1 FROM unnest(v_sessions) sid WHERE NOT EXISTS(SELECT 1 FROM public.sessions s
    JOIN public.students st ON st.id=s.student_id WHERE s.id=sid AND s.tutor_id=p_tutor_id
      AND st.organization_id=p_organization_id AND s.status IN ('completed','no_show')
      AND s.status_confirmed_at IS NOT NULL AND s.end_time<=now()))
  THEN RAISE EXCEPTION 'Tutor lessons changed; refresh preview' USING ERRCODE='40001'; END IF;
  SELECT coalesce(array_agg(value), '{}') INTO v_adjustments
    FROM jsonb_array_elements_text(coalesce(v_invoice.pdf_meta->'tutorAdjustmentIds','[]'));
  IF EXISTS(SELECT 1 FROM public.invoices i WHERE i.organization_id=p_organization_id AND i.status<>'cancelled'
    AND i.pdf_meta->>'invoiceKind'='tutor_pay' AND i.pdf_meta->>'tutorId'=p_tutor_id::text
    AND (EXISTS(SELECT 1 FROM public.invoice_line_items li WHERE li.invoice_id=i.id AND li.session_ids && v_sessions)
      OR coalesce(i.pdf_meta->'tutorAdjustmentIds','[]') ?| v_adjustments))
  THEN RAISE EXCEPTION 'Lessons or adjustments already invoiced; refresh preview' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM public.invoices i WHERE i.organization_id=p_organization_id AND upper(i.invoice_number)=upper(v_invoice.invoice_number))
  THEN RAISE EXCEPTION 'Invoice number already used' USING ERRCODE='23505'; END IF;
  INSERT INTO public.invoices(id,invoice_number,issued_by_user_id,organization_id,seller_user_id,seller_snapshot,buyer_snapshot,
    issue_date,period_start,period_end,grouping_type,subtotal,total_amount,status,origin,pdf_meta)
  VALUES(v_id,v_invoice.invoice_number,v_invoice.issued_by_user_id,p_organization_id,p_tutor_id,v_invoice.seller_snapshot,v_invoice.buyer_snapshot,
    v_invoice.issue_date,v_invoice.period_start,v_invoice.period_end,v_invoice.grouping_type,v_invoice.subtotal,v_invoice.total_amount,'issued','generated',v_invoice.pdf_meta);
  INSERT INTO public.invoice_line_items(invoice_id,description,quantity,unit_price,total_price,session_ids)
  SELECT v_id,li.description,li.quantity,li.unit_price,li.total_price,li.session_ids
    FROM jsonb_populate_recordset(NULL::public.invoice_line_items,p_lines) li;
  SELECT to_jsonb(i) INTO v_result FROM public.invoices i WHERE i.id=v_id;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.correct_org_tutor_invoice_number(
  p_organization_id uuid, p_invoice_id uuid, p_expected_number text, p_new_number text, p_changed_by uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_invoice public.invoices; v_result jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('org-tutor-invoices:' || p_organization_id::text, 0));
  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.pdf_meta->>'invoiceKind' IS DISTINCT FROM 'tutor_pay' OR v_invoice.status NOT IN ('issued','paid')
    OR v_invoice.billing_batch_id IS NOT NULL OR v_invoice.origin='external'
  THEN RAISE EXCEPTION 'Invoice cannot be changed'; END IF;
  IF v_invoice.invoice_number IS DISTINCT FROM p_expected_number THEN
    RAISE EXCEPTION 'Invoice number changed; refresh' USING ERRCODE='40001'; END IF;
  IF p_new_number IS NULL OR length(p_new_number)>60 OR p_new_number !~ '^[[:alnum:]][[:alnum:]_./-]*$' THEN
    RAISE EXCEPTION 'Invalid invoice number'; END IF;
  IF EXISTS(SELECT 1 FROM public.invoices i WHERE i.organization_id=p_organization_id
    AND i.id<>p_invoice_id AND upper(i.invoice_number)=upper(p_new_number))
  THEN RAISE EXCEPTION 'Invoice number already used' USING ERRCODE='23505'; END IF;
  IF v_invoice.invoice_number<>p_new_number THEN
    UPDATE public.invoices SET invoice_number=p_new_number, pdf_storage_path=NULL,
      pdf_meta=coalesce(v_invoice.pdf_meta,'{}') || jsonb_build_object('numberCorrections',
        coalesce(v_invoice.pdf_meta->'numberCorrections','[]') || jsonb_build_array(jsonb_build_object(
          'previousNumber',v_invoice.invoice_number,'number',p_new_number,'changedAt',now(),'changedBy',p_changed_by,
          'previousPdfPath',v_invoice.pdf_storage_path))) WHERE id=p_invoice_id;
  END IF;
  SELECT to_jsonb(i) INTO v_result FROM public.invoices i WHERE id=p_invoice_id;
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.allocate_org_tutor_invoice_number(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_org_tutor_pay_invoice(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.correct_org_tutor_invoice_number(uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_org_tutor_invoice_number(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_org_tutor_pay_invoice(uuid,uuid,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.correct_org_tutor_invoice_number(uuid,uuid,text,text,uuid) TO service_role;
