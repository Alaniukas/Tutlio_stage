-- One-time, explicitly approved support correction, not a schema migration.
-- The operator approved 8 x EUR 6 credits and a EUR 270 teacher invoice in the
-- Codex chat on 2026-10-21. Keep all eight original student invoices unchanged.
-- Two sources are still pending: their credits are agreed billing compensation,
-- not evidence of cash received. Do not mark those invoices paid or relax the
-- normal paid-only register_school_invoice_overpayment RPC.
DO $correction$
DECLARE
  v_org constant uuid := '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
  v_tutor constant uuid := '6eb7acb1-2358-45e8-996c-e66c8647f731';
  v_school_approver constant uuid := '0128fe57-a29d-4bf1-b4f6-63107e72bd8f';
  v_lesson_audit constant uuid := 'e618f8bb-6745-4285-bf6b-89871f8f233f';
  v_action constant text := 'record_yohan_september_2026_compensations';
  v_source_ids constant uuid[] := ARRAY[
    'e8b08e80-150d-441b-97d8-9d4a4d5a2b65', 'fab97a55-fab0-4ad8-b50a-3dff442f4550',
    'eb272135-f777-41bc-b1d3-9e497f69eac7', '2b148931-96c9-4294-9af8-c31dbd954d26',
    '0302b173-58b5-430f-9ee0-b322032292a1', '88e66614-ac15-4f43-bf8d-853d141acb28',
    '00dfdaae-02cb-4b41-ad85-aec8b5235a8a', 'c52b6a65-0aab-4676-8348-1607e8d82e44'
  ]::uuid[];
  v_manifest jsonb;
  v_students uuid[];
  v_before jsonb;
  v_lines_before jsonb;
  v_notes_before jsonb;
  v_records jsonb := '[]'::jsonb;
  v_count integer;
  v_row record;
  v_credit_id uuid;
  v_request_id uuid;
  v_reason text;
  v_note text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_action || v_org::text, 0));
  -- created_by identifies the approving school's owner, under whose delegation
  -- this correction is recorded. The audit below records the actual executor as
  -- platform support, not an authenticated session belonging to that owner.
  IF NOT EXISTS (SELECT 1 FROM public.organization_admins WHERE organization_id=v_org
    AND user_id=v_school_approver AND status='active' AND role='owner') THEN
    RAISE EXCEPTION 'The approving school account is no longer active';
  END IF;

  IF EXISTS (SELECT 1 FROM public.platform_admin_audit WHERE organization_id=v_org AND action=v_action) THEN
    SELECT count(*) INTO v_count FROM public.school_invoice_overpayments
      WHERE source_invoice_id=ANY(v_source_ids) AND organization_id=v_org AND amount_eur=6
        AND request_id=md5(v_action || ':' || source_invoice_id::text)::uuid AND voided_at IS NULL;
    IF v_count<>8 THEN RAISE EXCEPTION 'An existing correction changed; review it instead of issuing new credits'; END IF;
    RETURN;
  END IF;

  SELECT details->'related_student_invoices' INTO v_manifest FROM public.platform_admin_audit
    WHERE id=v_lesson_audit AND organization_id=v_org AND action='correct_yohan_september_2026_lessons';
  IF jsonb_array_length(v_manifest) IS DISTINCT FROM 8
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_manifest) m WHERE NOT (m->>'invoice_id')::uuid=ANY(v_source_ids))
    OR (SELECT count(DISTINCT m->>'invoice_id') FROM jsonb_array_elements(v_manifest) m)<>8 THEN
    RAISE EXCEPTION 'The original eight-invoice correction manifest is missing or changed';
  END IF;
  SELECT array_agg(DISTINCT student_id ORDER BY student_id) INTO v_students
    FROM public.school_monthly_invoices WHERE id=ANY(v_source_ids) AND organization_id=v_org;
  IF cardinality(v_students) IS DISTINCT FROM 8 THEN RAISE EXCEPTION 'Expected eight different students'; END IF;

  -- Match the existing billing trigger's student-first lock order. This also
  -- prevents a next invoice from missing these credits during registration.
  PERFORM id FROM public.students WHERE id=ANY(v_students) AND organization_id=v_org ORDER BY id FOR UPDATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count<>8 THEN RAISE EXCEPTION 'A student moved to another organization'; END IF;
  PERFORM id FROM public.school_monthly_invoices WHERE id=ANY(v_source_ids) ORDER BY id FOR UPDATE;
  PERFORM student_id FROM public.student_admin_notes WHERE student_id=ANY(v_students) ORDER BY student_id FOR UPDATE;
  PERFORM s.id FROM public.sessions s JOIN jsonb_array_elements(v_manifest) m
    ON s.id=(m->'affected_session_ids'->>0)::uuid ORDER BY s.id FOR UPDATE OF s;

  IF EXISTS (SELECT 1 FROM public.school_monthly_invoices WHERE organization_id=v_org
    AND period_start>'2026-09-30' AND payment_status<>'cancelled'
    AND (student_id=ANY(v_students) OR payer_student_ids && v_students)) THEN
    RAISE EXCEPTION 'A later invoice already exists; review its compensation first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.school_invoice_overpayments WHERE source_invoice_id=ANY(v_source_ids) AND voided_at IS NULL) THEN
    RAISE EXCEPTION 'A source invoice already has a credit; do not duplicate it';
  END IF;
  SELECT jsonb_agg(to_jsonb(i) ORDER BY id) INTO v_before FROM public.school_monthly_invoices i WHERE id=ANY(v_source_ids);
  SELECT jsonb_agg(to_jsonb(l) ORDER BY id) INTO v_lines_before FROM public.school_monthly_invoice_lines l WHERE invoice_id=ANY(v_source_ids);
  SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY student_id),'[]'::jsonb) INTO v_notes_before
    FROM public.student_admin_notes n WHERE student_id=ANY(v_students);

  FOR v_row IN SELECT i.*, m AS original, s.id AS affected_session_id,
      (s.start_time AT TIME ZONE 'Europe/Vilnius')::date AS lesson_date, s.status AS lesson_status,
      s.tutor_id AS lesson_tutor_id, s.student_id AS lesson_student_id, lower(trim(st.payer_email)) AS credit_payer_email
    FROM public.school_monthly_invoices i JOIN jsonb_array_elements(v_manifest) m ON i.id=(m->>'invoice_id')::uuid
    JOIN public.sessions s ON s.id=(m->'affected_session_ids'->>0)::uuid JOIN public.students st ON st.id=i.student_id
    ORDER BY i.id
  LOOP
    IF v_row.organization_id<>v_org OR v_row.invoice_number IS DISTINCT FROM v_row.original->>'invoice_number'
      OR v_row.total_eur IS DISTINCT FROM (v_row.original->>'total_eur')::numeric
      OR v_row.payment_status IS DISTINCT FROM v_row.original->>'payment_status'
      OR v_row.payment_status NOT IN ('paid','pending') OR v_row.credit_applied_eur<>0
      OR v_row.period_start<>'2026-09-01' OR v_row.period_end<>'2026-09-30'
      OR v_row.lesson_status<>'cancelled' OR v_row.lesson_tutor_id<>v_tutor OR v_row.lesson_student_id<>v_row.student_id
      OR v_row.lesson_date NOT IN ('2026-09-07','2026-09-09') OR coalesce(v_row.credit_payer_email,'')=''
      OR jsonb_array_length(v_row.original->'affected_session_ids')<>1 THEN
      RAISE EXCEPTION 'The source invoice or cancelled lesson changed: %',v_row.invoice_number;
    END IF;
    SELECT count(*) INTO v_count FROM public.school_monthly_invoice_lines
      WHERE invoice_id=v_row.id AND v_row.affected_session_id=ANY(session_ids) AND unit_price_eur=6 AND amount_eur>=6;
    IF v_count<>1 THEN RAISE EXCEPTION 'Expected one invoiced EUR 6 cancelled lesson: %',v_row.invoice_number; END IF;
    v_reason := format('Vienkartinė 6 € kompensacija už neįvykusį Yohan užsiėmimą %s, įtrauktą į %s. Mokyklos suderintas perkėlimas į kitą sąskaitą; pradinė sąskaita nepakeista. Pradinė būsena: %s. Užregistravo Tutlio palaikymas mokyklos administracijos vardu.',
      v_row.lesson_date,v_row.invoice_number,CASE WHEN v_row.payment_status='paid' THEN 'apmokėta' ELSE 'neapmokėta; kompensacija nėra mokėjimo patvirtinimas' END);
    v_request_id := md5(v_action || ':' || v_row.id::text)::uuid;
    INSERT INTO public.school_invoice_overpayments(organization_id,student_id,source_invoice_id,payer_email,amount_eur,reason,request_id,created_by)
      VALUES(v_org,v_row.student_id,v_row.id,v_row.credit_payer_email,6,v_reason,v_request_id,v_school_approver) RETURNING id INTO v_credit_id;
    v_note := format('[YOHAN-2026-09 %s] Užregistruota vienkartinė 6 € kompensacija už %s neįvykusį Yohan užsiėmimą. Ji automatiškai užskaitoma formuojant kitą mėnesio sąskaitą. Pradinė %s sąskaita palikta nepakeista. Likutis ir panaudojimas: Finansai → Mokėjimai → Permokos. Papildomai rankomis 6 € neatimti.',
      v_row.invoice_number,v_row.lesson_date,v_row.invoice_number);
    INSERT INTO public.student_admin_notes(student_id,admin_comment,updated_at)
      VALUES(v_row.student_id,v_note,now()) ON CONFLICT(student_id) DO UPDATE
      SET admin_comment=concat_ws(E'\n\n',nullif(btrim(public.student_admin_notes.admin_comment),''),EXCLUDED.admin_comment),updated_at=now();
    v_records := v_records || jsonb_build_array(jsonb_build_object('credit_id',v_credit_id,'request_id',v_request_id,
      'source_invoice_id',v_row.id,'invoice_number',v_row.invoice_number,'student_id',v_row.student_id,
      'amount_eur',6,'session_id',v_row.affected_session_id,'lesson_date',v_row.lesson_date,'source_payment_status',v_row.payment_status));
  END LOOP;
  IF jsonb_array_length(v_records)<>8 THEN RAISE EXCEPTION 'Expected exactly eight compensation records'; END IF;
  IF v_before IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.school_monthly_invoices i WHERE id=ANY(v_source_ids))
    OR v_lines_before IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.school_monthly_invoice_lines l WHERE invoice_id=ANY(v_source_ids)) THEN
    RAISE EXCEPTION 'Original student invoices must remain unchanged';
  END IF;
  INSERT INTO public.platform_admin_audit(action,organization_id,details) VALUES(v_action,v_org,jsonb_build_object(
    'authorization','Direct user approval in Codex on 2026-10-21: Taip, atlik abu veiksmus. Eight EUR 6 compensations; keep original student invoices unchanged; issue Yohan EUR 270 invoice; no emails.',
    'executor','Tutlio platform support via administrative SQL; no school administrator authentication was impersonated',
    'created_by_attribution','School approving owner/delegating account, not the authenticated executor',
    'school_approver_user_id',v_school_approver,'lesson_correction_audit_id',v_lesson_audit,
    'teacher_invoice_id','0245c808-601c-4742-953e-0dad7522e2d1','teacher_invoice_number','SF-001',
    'credit_kind','agreed_billing_compensation','includes_unpaid_source_compensation',true,
    'records',v_records,'total_eur',48,'student_invoices_changed',false,'emails_sent',false,
    'invoice_snapshots_before',v_before,'private_notes_before',v_notes_before));
END;
$correction$;
