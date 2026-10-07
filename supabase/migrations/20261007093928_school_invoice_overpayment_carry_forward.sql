-- Payment adjustments have their own audit trail; issued lesson totals stay intact.
ALTER TABLE public.school_monthly_invoices
  ADD COLUMN credit_applied_eur numeric(10,2) NOT NULL DEFAULT 0 CHECK (credit_applied_eur >= 0 AND credit_applied_eur <= total_eur),
  ADD COLUMN credit_preview_eur numeric(10,2),
  ADD COLUMN payer_student_ids uuid[];

CREATE TABLE public.school_invoice_overpayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  student_id uuid NOT NULL REFERENCES public.students(id),
  source_invoice_id uuid NOT NULL REFERENCES public.school_monthly_invoices(id),
  payer_email text NOT NULL,
  amount_eur numeric(10,2) NOT NULL CHECK (amount_eur > 0),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 1000),
  request_id uuid NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid REFERENCES auth.users(id),
  void_reason text,
  CHECK ((voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
    OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND length(trim(void_reason)) BETWEEN 3 AND 1000))
);
CREATE UNIQUE INDEX school_invoice_overpayments_source_active
  ON public.school_invoice_overpayments(source_invoice_id) WHERE voided_at IS NULL;
CREATE INDEX school_invoice_overpayments_student ON public.school_invoice_overpayments(organization_id, student_id, created_at);

CREATE TABLE public.school_invoice_overpayment_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  overpayment_id uuid NOT NULL REFERENCES public.school_invoice_overpayments(id),
  invoice_id uuid NOT NULL REFERENCES public.school_monthly_invoices(id) DEFERRABLE INITIALLY DEFERRED,
  amount_eur numeric(10,2) NOT NULL CHECK (amount_eur > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  UNIQUE(overpayment_id, invoice_id)
);
CREATE INDEX school_invoice_overpayment_uses_invoice ON public.school_invoice_overpayment_uses(invoice_id);

ALTER TABLE public.school_invoice_overpayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_invoice_overpayment_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_invoice_overpayments, public.school_invoice_overpayment_uses FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.school_invoice_overpayments, public.school_invoice_overpayment_uses TO authenticated;
GRANT ALL ON public.school_invoice_overpayments, public.school_invoice_overpayment_uses TO service_role;
CREATE POLICY school_overpayments_admin_read ON public.school_invoice_overpayments FOR SELECT TO authenticated
  USING (public.is_school_admin(organization_id) AND private.org_admin_permission_gate(ARRAY['finance.view','finance.edit']));
CREATE POLICY school_overpayment_uses_admin_read ON public.school_invoice_overpayment_uses FOR SELECT TO authenticated
  USING (overpayment_id IN (SELECT id FROM public.school_invoice_overpayments));

CREATE FUNCTION public.register_school_invoice_overpayment(
  p_organization_id uuid, p_invoice_id uuid, p_amount_eur numeric, p_reason text, p_request_id uuid, p_created_by uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_source public.school_monthly_invoices; v_previous public.school_invoice_overpayments; v_id uuid; v_email text;
BEGIN
  IF p_amount_eur IS NULL OR p_amount_eur <= 0 OR p_amount_eur <> round(p_amount_eur,2)
    OR p_request_id IS NULL OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'Nurodykite teisingą permokos sumą ir priežastį.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_admins a WHERE a.organization_id=p_organization_id
    AND a.user_id=p_created_by AND a.status='active'
    AND (private.org_admin_role_grants_permission(a.role,'finance.edit') OR a.permissions @> '{"finance.edit":true}'::jsonb)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT * INTO v_source FROM public.school_monthly_invoices WHERE id=p_invoice_id AND organization_id=p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sąskaita nerasta.'; END IF;
  -- All allocation/registration operations lock student rows in the same order.
  PERFORM id FROM public.students WHERE id=v_source.student_id FOR UPDATE;
  SELECT * INTO v_source FROM public.school_monthly_invoices WHERE id=p_invoice_id FOR UPDATE;
  SELECT * INTO v_previous FROM public.school_invoice_overpayments WHERE request_id=p_request_id;
  IF FOUND THEN
    IF v_previous.organization_id=p_organization_id AND v_previous.source_invoice_id=p_invoice_id
      AND v_previous.amount_eur=p_amount_eur AND v_previous.reason=trim(p_reason) THEN RETURN v_previous.id; END IF;
    RAISE EXCEPTION 'Permokos registravimo duomenys pasikeitė.';
  END IF;
  IF v_source.payment_status <> 'paid' OR p_amount_eur > v_source.total_eur-v_source.credit_applied_eur THEN
    RAISE EXCEPTION 'Permoka negali viršyti apmokėtos sąskaitos pinigais sumos.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.school_invoice_overpayments WHERE source_invoice_id=p_invoice_id AND voided_at IS NULL) THEN
    RAISE EXCEPTION 'Šios sąskaitos permoka jau užregistruota.';
  END IF;
  SELECT lower(trim(payer_email)) INTO v_email FROM public.students WHERE id=v_source.student_id AND organization_id=p_organization_id;
  IF coalesce(v_email,'')='' THEN RAISE EXCEPTION 'Mokėtojo el. paštas nenurodytas.'; END IF;
  INSERT INTO public.school_invoice_overpayments(organization_id,student_id,source_invoice_id,payer_email,amount_eur,reason,request_id,created_by)
    VALUES(p_organization_id,v_source.student_id,p_invoice_id,v_email,p_amount_eur,trim(p_reason),p_request_id,p_created_by) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE FUNCTION public.void_school_invoice_overpayment(p_organization_id uuid,p_overpayment_id uuid,p_reason text,p_created_by uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_credit public.school_invoice_overpayments;
BEGIN
  IF length(trim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Nurodykite atšaukimo priežastį.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_admins a WHERE a.organization_id=p_organization_id
    AND a.user_id=p_created_by AND a.status='active'
    AND (private.org_admin_role_grants_permission(a.role,'finance.edit') OR a.permissions @> '{"finance.edit":true}'::jsonb)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT * INTO v_credit FROM public.school_invoice_overpayments WHERE id=p_overpayment_id AND organization_id=p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Permoka nerasta.'; END IF;
  PERFORM id FROM public.students WHERE id=v_credit.student_id FOR UPDATE;
  SELECT * INTO v_credit FROM public.school_invoice_overpayments WHERE id=p_overpayment_id FOR UPDATE;
  IF v_credit.voided_at IS NOT NULL THEN RETURN v_credit.id; END IF;
  IF EXISTS (SELECT 1 FROM public.school_invoice_overpayment_uses WHERE overpayment_id=p_overpayment_id AND released_at IS NULL) THEN
    RAISE EXCEPTION 'Panaudotos permokos atšaukti negalima.';
  END IF;
  UPDATE public.school_invoice_overpayments SET voided_at=now(),voided_by=p_created_by,void_reason=trim(p_reason) WHERE id=p_overpayment_id;
  RETURN p_overpayment_id;
END; $$;

-- Apply only to newly issued invoices for a later period. Reservations and the
-- invoice insert commit together, including a completely credit-covered bill.
CREATE FUNCTION public.apply_school_invoice_overpayments() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_ids uuid[]; v_email text; v_credit record; v_balance numeric; v_remaining numeric;
BEGIN
  v_ids := coalesce(NEW.payer_student_ids,ARRAY[NEW.student_id]);
  IF NOT NEW.student_id=ANY(v_ids) THEN RAISE EXCEPTION 'Invalid payer students'; END IF;
  PERFORM id FROM public.students WHERE id=ANY(v_ids) ORDER BY id FOR UPDATE;
  SELECT lower(trim(payer_email)) INTO v_email FROM public.students WHERE id=NEW.student_id AND organization_id=NEW.organization_id;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM unnest(v_ids) i LEFT JOIN public.students s ON s.id=i
    WHERE s.id IS NULL OR s.organization_id IS DISTINCT FROM NEW.organization_id
      OR (i<>NEW.student_id AND (coalesce(v_email,'')='' OR lower(trim(s.payer_email)) IS DISTINCT FROM v_email))) THEN
    RAISE EXCEPTION 'Invalid payer students';
  END IF;
  NEW.payer_student_ids := v_ids;
  NEW.credit_applied_eur := 0;
  IF NEW.payment_status='pending' AND NEW.total_eur>0 THEN
    v_remaining := NEW.total_eur;
    FOR v_credit IN SELECT c.* FROM public.school_invoice_overpayments c
      JOIN public.school_monthly_invoices source ON source.id=c.source_invoice_id
      WHERE c.organization_id=NEW.organization_id AND c.student_id=ANY(v_ids) AND c.voided_at IS NULL
        AND c.payer_email=v_email AND source.period_end<NEW.period_start
      ORDER BY c.created_at,c.id FOR UPDATE OF c
    LOOP
      SELECT v_credit.amount_eur-coalesce(sum(u.amount_eur),0) INTO v_balance
        FROM public.school_invoice_overpayment_uses u WHERE u.overpayment_id=v_credit.id AND u.released_at IS NULL;
      v_balance := least(v_balance,v_remaining);
      IF v_balance>0 THEN
        INSERT INTO public.school_invoice_overpayment_uses(overpayment_id,invoice_id,amount_eur) VALUES(v_credit.id,NEW.id,v_balance);
        NEW.credit_applied_eur := NEW.credit_applied_eur+v_balance;
        v_remaining := v_remaining-v_balance;
      END IF;
      EXIT WHEN v_remaining=0;
    END LOOP;
    IF NEW.credit_applied_eur=NEW.total_eur THEN
      NEW.payment_status := 'paid'; NEW.paid_at := now(); NEW.paid_via := 'credit';
    END IF;
  END IF;
  IF NEW.credit_preview_eur IS NOT NULL AND NEW.credit_preview_eur IS DISTINCT FROM NEW.credit_applied_eur THEN
    RAISE EXCEPTION 'Permokos likutis pasikeitė. Peržiūrėkite sąskaitą dar kartą.';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER school_invoice_apply_overpayments BEFORE INSERT ON public.school_monthly_invoices
  FOR EACH ROW EXECUTE FUNCTION public.apply_school_invoice_overpayments();

CREATE FUNCTION public.protect_school_invoice_overpayments() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_source_credit boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.school_invoice_overpayments WHERE source_invoice_id=OLD.id AND voided_at IS NULL) INTO v_source_credit;
  IF NEW.credit_applied_eur IS DISTINCT FROM OLD.credit_applied_eur
    OR ((OLD.credit_applied_eur>0 OR v_source_credit) AND (NEW.total_eur IS DISTINCT FROM OLD.total_eur
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.student_id IS DISTINCT FROM OLD.student_id
      OR NEW.payer_student_ids IS DISTINCT FROM OLD.payer_student_ids)) THEN
    RAISE EXCEPTION 'Permokos panaudojimo įrašo keisti negalima.';
  END IF;
  IF OLD.payment_status='paid' AND NEW.payment_status<>'paid' AND (v_source_credit OR OLD.paid_via='credit') THEN
    RAISE EXCEPTION 'Apmokėtos sąskaitos su permoka būsenos keisti negalima.';
  END IF;
  IF OLD.payment_status='cancelled' AND NEW.payment_status<>'cancelled' AND OLD.credit_applied_eur>0 THEN
    RAISE EXCEPTION 'Atšauktą sąskaitą reikia išrašyti iš naujo.';
  END IF;
  IF NEW.payment_status='cancelled' AND OLD.payment_status<>'cancelled' THEN
    IF OLD.payment_status='paid' AND (OLD.credit_applied_eur>0 OR EXISTS (
      SELECT 1 FROM public.school_invoice_overpayments WHERE source_invoice_id=OLD.id AND voided_at IS NULL)) THEN
      RAISE EXCEPTION 'Apmokėtos sąskaitos su permoka atšaukti negalima.';
    END IF;
    PERFORM id FROM public.students WHERE id=ANY(OLD.payer_student_ids) ORDER BY id FOR UPDATE;
    UPDATE public.school_invoice_overpayment_uses SET released_at=now() WHERE invoice_id=OLD.id AND released_at IS NULL;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER school_invoice_protect_overpayments BEFORE UPDATE ON public.school_monthly_invoices
  FOR EACH ROW EXECUTE FUNCTION public.protect_school_invoice_overpayments();

REVOKE ALL ON FUNCTION public.register_school_invoice_overpayment(uuid,uuid,numeric,text,uuid,uuid),
  public.void_school_invoice_overpayment(uuid,uuid,text,uuid), public.apply_school_invoice_overpayments(),
  public.protect_school_invoice_overpayments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_school_invoice_overpayment(uuid,uuid,numeric,text,uuid,uuid),
  public.void_school_invoice_overpayment(uuid,uuid,text,uuid) TO service_role;
COMMENT ON COLUMN public.school_monthly_invoices.credit_applied_eur IS 'Amount settled by a previous paid invoice overpayment. Cash due = total_eur - credit_applied_eur.';
