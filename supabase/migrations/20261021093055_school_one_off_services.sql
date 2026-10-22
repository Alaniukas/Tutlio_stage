-- Admin-assigned one-off services. No contracts or sessions are created.
CREATE TABLE public.school_service_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  unit_price_eur numeric(10,2) NOT NULL CHECK (unit_price_eur > 0 AND unit_price_eur <= 9999),
  is_active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX school_service_templates_active_name ON public.school_service_templates(organization_id, lower(btrim(name))) WHERE is_active;
CREATE INDEX school_service_templates_org ON public.school_service_templates(organization_id, name, id);

CREATE TABLE public.school_student_service_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  student_id uuid NOT NULL REFERENCES public.students(id),
  template_id uuid REFERENCES public.school_service_templates(id),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 160),
  unit_price_eur numeric(10,2) NOT NULL CHECK (unit_price_eur > 0 AND unit_price_eur <= 9999),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  service_date date NOT NULL CHECK (service_date BETWEEN '2000-01-01' AND '2099-12-31'),
  invoice_month date NOT NULL CHECK (extract(day FROM invoice_month) = 1 AND invoice_month BETWEEN '2000-01-01' AND '2099-12-01'),
  internal_note text CHECK (length(internal_note) <= 1000),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id),
  invoice_id uuid REFERENCES public.school_monthly_invoices(id),
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX school_service_charges_student ON public.school_student_service_charges(organization_id, student_id, invoice_month);
CREATE INDEX school_service_charges_month ON public.school_student_service_charges(organization_id, invoice_month) WHERE cancelled_at IS NULL;
CREATE INDEX school_service_charges_invoice ON public.school_student_service_charges(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX school_service_charges_template ON public.school_student_service_charges(template_id) WHERE template_id IS NOT NULL;

-- All reads and mutations go through the org/finance permission checked API.
ALTER TABLE public.school_service_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_student_service_charges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_service_templates, public.school_student_service_charges FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.school_service_templates, public.school_student_service_charges TO service_role;

ALTER TABLE public.school_monthly_invoice_lines
  ADD COLUMN service_charge_id uuid REFERENCES public.school_student_service_charges(id),
  ADD COLUMN service_charge_version integer,
  ADD COLUMN service_date date;
ALTER TABLE public.school_monthly_invoice_lines DROP CONSTRAINT school_monthly_invoice_lines_source_check;
ALTER TABLE public.school_monthly_invoice_lines ADD CONSTRAINT school_monthly_invoice_lines_source_check
  CHECK (source IN ('extra_base','extra_overage','lesson','consultation_free','consultation_paid','discount','service'));
ALTER TABLE public.school_monthly_invoice_lines ADD CONSTRAINT school_invoice_service_source_check
  CHECK ((source = 'service') = (service_charge_id IS NOT NULL));
CREATE UNIQUE INDEX school_invoice_service_once ON public.school_monthly_invoice_lines(invoice_id, service_charge_id) WHERE service_charge_id IS NOT NULL;
CREATE INDEX school_invoice_service_history ON public.school_monthly_invoice_lines(service_charge_id) WHERE service_charge_id IS NOT NULL;

CREATE FUNCTION public.guard_school_service_record() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_changed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Service history cannot be deleted'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
    RAISE EXCEPTION 'Service identity cannot be changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id=NEW.organization_id AND entity_type='school') THEN
    RAISE EXCEPTION 'School not found';
  END IF;
  IF TG_TABLE_NAME = 'school_student_service_charges' THEN
    IF NOT EXISTS (SELECT 1 FROM public.students WHERE id=NEW.student_id AND organization_id=NEW.organization_id)
      OR (NEW.template_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.school_service_templates WHERE id=NEW.template_id AND organization_id=NEW.organization_id)) THEN
      RAISE EXCEPTION 'Service belongs to another organization';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.student_id IS DISTINCT FROM OLD.student_id THEN RAISE EXCEPTION 'Service student cannot be changed'; END IF;
      v_changed := (to_jsonb(NEW) - ARRAY['invoice_id','version','updated_at','updated_by']) IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['invoice_id','version','updated_at','updated_by']);
      IF OLD.invoice_id IS NOT NULL AND v_changed THEN RAISE EXCEPTION 'Service is already invoiced'; END IF;
    END IF;
  ELSE
    v_changed := TG_OP='UPDATE';
  END IF;
  IF TG_OP='UPDATE' AND v_changed THEN NEW.version := OLD.version + 1; NEW.updated_at := clock_timestamp(); END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_school_service_template BEFORE INSERT OR UPDATE OR DELETE ON public.school_service_templates FOR EACH ROW EXECUTE FUNCTION public.guard_school_service_record();
CREATE TRIGGER guard_school_service_charge BEFORE INSERT OR UPDATE OR DELETE ON public.school_student_service_charges FOR EACH ROW EXECUTE FUNCTION public.guard_school_service_record();

-- Claim the source row in the same transaction as the invoice lines. A second
-- writer waits for this row and then sees the claim; cancelled invoices release it.
CREATE FUNCTION public.claim_school_invoice_service() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_charge public.school_student_service_charges; v_invoice public.school_monthly_invoices;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF OLD.service_charge_id IS NOT NULL OR (TG_OP='UPDATE' AND NEW.service_charge_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Invoiced service history cannot be changed';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF NEW.service_charge_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_charge FROM public.school_student_service_charges WHERE id=NEW.service_charge_id FOR UPDATE;
  SELECT * INTO v_invoice FROM public.school_monthly_invoices WHERE id=NEW.invoice_id;
  IF v_charge.id IS NULL OR v_invoice.id IS NULL OR v_charge.invoice_id IS NOT NULL OR v_charge.cancelled_at IS NOT NULL
    OR v_invoice.payment_status='cancelled' OR v_charge.organization_id IS DISTINCT FROM v_invoice.organization_id
    OR NOT v_charge.student_id=ANY(coalesce(v_invoice.payer_student_ids, ARRAY[v_invoice.student_id]))
    OR v_charge.invoice_month NOT BETWEEN v_invoice.period_start AND v_invoice.period_end
    OR NEW.service_charge_version IS DISTINCT FROM v_charge.version
    OR NEW.service_date IS DISTINCT FROM v_charge.service_date
    OR NEW.unit_price_eur IS DISTINCT FROM v_charge.unit_price_eur OR NEW.quantity IS DISTINCT FROM v_charge.quantity
    OR NEW.amount_eur IS DISTINCT FROM v_charge.unit_price_eur*v_charge.quantity
    OR NEW.original_amount_eur IS DISTINCT FROM NEW.amount_eur OR coalesce(NEW.discount_amount_eur,0)<>0
    OR NEW.session_id IS NOT NULL OR cardinality(NEW.session_ids)>0 OR NEW.consultation_id IS NOT NULL THEN
    RAISE EXCEPTION 'Service changed or is already invoiced. Refresh the invoice preview';
  END IF;
  UPDATE public.school_student_service_charges SET invoice_id=NEW.invoice_id WHERE id=v_charge.id;
  RETURN NEW;
END; $$;
CREATE TRIGGER claim_school_invoice_service BEFORE INSERT OR UPDATE OR DELETE ON public.school_monthly_invoice_lines FOR EACH ROW EXECUTE FUNCTION public.claim_school_invoice_service();

CREATE FUNCTION public.release_cancelled_invoice_services() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF OLD.payment_status='cancelled' AND NEW.payment_status<>'cancelled'
    AND EXISTS (SELECT 1 FROM public.school_monthly_invoice_lines WHERE invoice_id=OLD.id AND service_charge_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Cancelled service invoices must be reissued';
  END IF;
  IF NEW.payment_status='cancelled' AND OLD.payment_status<>'cancelled' THEN
    UPDATE public.school_student_service_charges SET invoice_id=NULL WHERE invoice_id=NEW.id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER release_cancelled_invoice_services AFTER UPDATE OF payment_status ON public.school_monthly_invoices FOR EACH ROW EXECUTE FUNCTION public.release_cancelled_invoice_services();

CREATE FUNCTION public.protect_school_service_invoice() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.school_monthly_invoice_lines WHERE invoice_id=OLD.id AND service_charge_id IS NOT NULL)
    AND (NEW.organization_id,NEW.student_id,NEW.payer_student_ids,NEW.contract_id,NEW.period_start,NEW.period_end,
      NEW.invoice_number,NEW.unit_price_eur,NEW.base_lessons,NEW.base_amount_eur,NEW.extra_lessons,NEW.extra_amount_eur,
      NEW.subtotal_eur,NEW.discount_amount_eur,NEW.total_eur,NEW.billing_model,NEW.billed_session_ids)
    IS DISTINCT FROM (OLD.organization_id,OLD.student_id,OLD.payer_student_ids,OLD.contract_id,OLD.period_start,OLD.period_end,
      OLD.invoice_number,OLD.unit_price_eur,OLD.base_lessons,OLD.base_amount_eur,OLD.extra_lessons,OLD.extra_amount_eur,
      OLD.subtotal_eur,OLD.discount_amount_eur,OLD.total_eur,OLD.billing_model,OLD.billed_session_ids) THEN
    RAISE EXCEPTION 'Issued service invoice amounts and sources cannot be changed';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER protect_school_service_invoice BEFORE UPDATE ON public.school_monthly_invoices FOR EACH ROW EXECUTE FUNCTION public.protect_school_service_invoice();
REVOKE ALL ON FUNCTION public.protect_school_service_invoice() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.protect_school_service_invoice() TO service_role;

-- Atomic first issue and optional replacement of unsent actual payer invoices.
-- PDF generation and delivery happen outside this short database transaction.
CREATE FUNCTION public.issue_school_service_invoice(p_organization_id uuid, p_previous jsonb, p_invoice jsonb, p_lines jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_expected jsonb; v_old jsonb; v_ids uuid[]; v_id uuid := gen_random_uuid();
  v_sessions uuid[]; v_students uuid[]; v_result jsonb;
BEGIN
  IF jsonb_typeof(p_previous)<>'array' OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)=0
    OR (p_invoice->>'organization_id')::uuid IS DISTINCT FROM p_organization_id THEN RAISE EXCEPTION 'Invalid invoice'; END IF;
  PERFORM id FROM public.organizations WHERE id=p_organization_id AND entity_type='school' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found'; END IF;
  SELECT coalesce(array_agg((i->>'id')::uuid),'{}') INTO v_ids FROM jsonb_array_elements(p_previous) i;
  SELECT array_agg(s::uuid) INTO v_students FROM jsonb_array_elements_text(p_invoice->'payer_student_ids') s;
  IF cardinality(v_students) IS NULL OR NOT (p_invoice->>'student_id')::uuid=ANY(v_students)
    OR EXISTS (SELECT 1 FROM unnest(v_students) s WHERE NOT EXISTS (SELECT 1 FROM public.students WHERE id=s AND organization_id=p_organization_id)) THEN
    RAISE EXCEPTION 'Invalid invoice students';
  END IF;
  FOR v_expected IN SELECT value FROM jsonb_array_elements(p_previous) ORDER BY value->>'id' LOOP
    SELECT to_jsonb(i) INTO v_old FROM public.school_monthly_invoices i WHERE id=(v_expected->>'id')::uuid FOR UPDATE;
    IF v_old IS NULL OR v_old->>'organization_id' IS DISTINCT FROM p_organization_id::text
      OR v_old->>'payment_status' IS DISTINCT FROM 'pending' OR v_old->>'billing_model' IS DISTINCT FROM 'actual'
      OR v_old->>'contract_id' IS NOT NULL OR coalesce(v_old->>'stripe_checkout_session_id','')<>''
      OR coalesce(v_old->>'invoice_email_sent_at','')<>'' OR coalesce((v_old->>'credit_applied_eur')::numeric,0)>0
      OR v_old->>'period_start' IS DISTINCT FROM p_invoice->>'period_start' OR v_old->>'period_end' IS DISTINCT FROM p_invoice->>'period_end'
      OR NOT coalesce(ARRAY(SELECT s::uuid FROM jsonb_array_elements_text(v_old->'payer_student_ids') s),ARRAY[(v_old->>'student_id')::uuid]) <@ v_students
      OR NOT (v_old->>'student_id')::uuid=ANY(v_students)
      OR NOT (v_expected - 'lines') <@ v_old THEN RAISE EXCEPTION 'Invoice changed or cannot be regenerated'; END IF;
  END LOOP;
  IF (p_invoice->>'total_eur')::numeric IS DISTINCT FROM (SELECT sum((li->>'amount_eur')::numeric) FROM jsonb_array_elements(p_lines) li) THEN
    RAISE EXCEPTION 'Invoice total differs from its lines';
  END IF;
  UPDATE public.school_monthly_invoices SET payment_status='cancelled' WHERE id=ANY(v_ids);
  SELECT coalesce(array_agg(DISTINCT s::uuid),'{}') INTO v_sessions FROM jsonb_array_elements(p_lines) li CROSS JOIN LATERAL jsonb_array_elements_text(li->'session_ids') s;
  IF EXISTS (SELECT 1 FROM public.school_monthly_invoices i WHERE i.organization_id=p_organization_id AND i.payment_status<>'cancelled'
    AND (i.billed_session_ids && v_sessions OR i.extra_session_ids && v_sessions OR EXISTS
      (SELECT 1 FROM public.school_monthly_invoice_lines li WHERE li.invoice_id=i.id AND (li.session_ids && v_sessions OR li.session_id=ANY(v_sessions))))) THEN
    RAISE EXCEPTION 'Sessions already invoiced. Refresh the preview';
  END IF;
  INSERT INTO public.school_monthly_invoices(id,organization_id,contract_id,student_id,period_start,period_end,unit_price_eur,
    base_lessons,base_amount_eur,extra_lessons,extra_amount_eur,subtotal_eur,discount_amount_eur,discount_note,total_eur,
    credit_preview_eur,payer_student_ids,extra_session_ids,billing_model,billed_session_ids,payment_status,due_date,invoice_number,issuer_note)
  SELECT v_id,p_organization_id,NULL,x.student_id,x.period_start,x.period_end,0,0,0,0,0,x.subtotal_eur,x.discount_amount_eur,
    x.discount_note,x.total_eur,x.credit_preview_eur,x.payer_student_ids,'{}','actual',x.billed_session_ids,'pending',x.due_date,x.invoice_number,x.issuer_note
  FROM jsonb_populate_record(NULL::public.school_monthly_invoices,p_invoice) x;
  INSERT INTO public.school_monthly_invoice_lines(invoice_id,sort_order,description,unit_price_eur,quantity,original_amount_eur,
    discount_type,discount_value,discount_amount_eur,discount_note,amount_eur,source,consultation_id,session_id,session_ids,service_charge_id,service_charge_version,service_date)
  SELECT v_id,x.sort_order,x.description,x.unit_price_eur,x.quantity,x.original_amount_eur,x.discount_type,x.discount_value,
    x.discount_amount_eur,x.discount_note,x.amount_eur,x.source,x.consultation_id,x.session_id,x.session_ids,x.service_charge_id,x.service_charge_version,x.service_date
  FROM jsonb_populate_recordset(NULL::public.school_monthly_invoice_lines,p_lines) x;
  SELECT to_jsonb(i) INTO v_result FROM public.school_monthly_invoices i WHERE id=v_id;
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.issue_school_service_invoice(uuid,jsonb,jsonb,jsonb), public.guard_school_service_record(), public.claim_school_invoice_service(), public.release_cancelled_invoice_services() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_school_service_invoice(uuid,jsonb,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_school_service_record(), public.claim_school_invoice_service(), public.release_cancelled_invoice_services() TO service_role;

UPDATE public.organizations SET features=coalesce(features,'{}'::jsonb) || '{"school_service_charges":true}'::jsonb
WHERE id IN ('2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17','c3a00000-7e57-4000-8000-000000000001') AND entity_type='school';
