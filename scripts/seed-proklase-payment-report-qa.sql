-- Payment report QA. Fake data only in the existing Demo Pro Klasė organization.
-- Idempotent inserts preserve all existing demo scenarios. No email or payment API is called.
BEGIN;
DO $qa$
DECLARE
  demo_org constant uuid := 'b0a00000-7e57-4000-8000-000000000001';
  demo_admin constant uuid := 'b0a00000-7e57-4000-8000-000000000002';
  ona constant uuid := 'b0a00000-7e57-4000-8000-000000000003';
  jonas constant uuid := 'b0a00000-7e57-4000-8000-000000000004';
  greta constant uuid := 'b0a00000-7e57-4000-8000-000000000008';
  math_ona constant uuid := 'b0a00000-7e57-4000-8000-000000000011';
  trial_ona constant uuid := 'b0a00000-7e57-4000-8000-000000000013';
  math_jonas constant uuid := 'e2118d24-f1ce-4780-b658-682a9637a100';
  trial_jonas constant uuid := '8bd293c0-3536-4340-a03c-c223fd70e00e';
  math_greta constant uuid := 'de2770aa-ca7a-4360-8ae5-fee9ab77b074';
  prefix constant text := 'b0a07107-7e57-4000-8000-';
  row_data record;
  student_row public.students;
  source_id uuid;
  invoice_id uuid;
  tutor_id uuid;
  subject_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id=demo_org AND slug='proklase-qa' AND entity_type='company')
    OR NOT EXISTS (SELECT 1 FROM public.organization_admins WHERE organization_id=demo_org AND user_id=demo_admin)
    OR (SELECT count(*) FROM public.profiles WHERE organization_id=demo_org AND id IN (ona,jonas,greta)) <> 3 THEN
    RAISE EXCEPTION 'Expected Demo Pro Klasė organization, admin and tutors are missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.students WHERE id::text LIKE prefix || '%' AND organization_id IS DISTINCT FROM demo_org)
    OR EXISTS (SELECT 1 FROM public.invoices WHERE id::text LIKE prefix || '%' AND organization_id IS DISTINCT FROM demo_org)
    OR EXISTS (SELECT 1 FROM public.lesson_packages p JOIN public.students s ON s.id=p.student_id WHERE p.id::text LIKE prefix || '%' AND s.organization_id IS DISTINCT FROM demo_org)
    OR EXISTS (SELECT 1 FROM public.sessions x JOIN public.students s ON s.id=x.student_id WHERE x.id::text LIKE prefix || '%' AND s.organization_id IS DISTINCT FROM demo_org) THEN
    RAISE EXCEPTION 'QA IDs belong to another organization';
  END IF;

  FOR row_data IN SELECT * FROM (VALUES
    (1, 'Demo Mantas Žilinskas', ona, 'Rasa Žilinskienė', 'rasa.zilinskiene@example.test', '+370 600 01001'),
    (2, 'Demo Mantas Žilinskas', jonas, 'Rasa Žilinskienė', 'rasa.zilinskiene@example.test', '+370 600 01001'),
    (3, 'Demo Emilija Šimkutė', jonas, 'Dovilė Šimkienė', 'dovile.simkiene@example.test', '+370 600 01002'),
    (4, 'Demo Gabija Jankauskaitė', ona, 'Agnė Jankauskienė', 'agne.jankauskiene@example.test', '+370 600 01003'),
    (5, 'Demo Lukas Petraitis', greta, 'Tomas Petraitis', 'tomas.petraitis@example.test', '+370 600 01004'),
    (6, 'Demo Austėja Kazlauskaitė', greta, 'Eglė Kazlauskienė', 'egle.kazlauskiene@example.test', '+370 600 01005'),
    (7, 'Demo Nojus Žilinskas', jonas, 'Rasa Žilinskienė', 'rasa.zilinskiene@example.test', '+370 600 01001'),
    (8, 'Demo Eksporto patikra', ona, 'Demo Mokėtojas; su kabutėmis "QA"', 'eksporto.patikra@example.test', '+370 600 01999')
  ) AS fixture(n, name, tutor, payer, email, phone) LOOP
    INSERT INTO public.students (id,organization_id,tutor_id,full_name,payment_payer,payer_name,payer_email,payer_phone,payment_model,trial_offer_disabled,created_at)
    VALUES ((prefix || lpad(row_data.n::text,12,'0'))::uuid,demo_org,row_data.tutor,row_data.name,'parent',row_data.payer,row_data.email,row_data.phone,'per_lesson',true,'2026-08-28T08:00:00Z')
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- Invoice, package and trial fixtures. Number 11 is an uninvoiced pending order.
  FOR row_data IN SELECT * FROM (VALUES
    (1,1,ona,trial_ona,1,10::numeric,'2026-09-05'::date,'paid','2026-09-05T09:00:00Z'::timestamptz),
    (2,1,ona,math_ona,4,100,'2026-09-09','paid','2026-09-10T09:00:00Z'),
    (3,2,jonas,math_jonas,4,100,'2026-10-01','paid','2026-10-02T09:00:00Z'),
    (4,3,jonas,trial_jonas,1,10,'2026-10-06','paid','2026-10-06T09:00:00Z'),
    (5,4,ona,math_ona,4,100,'2026-10-04','pending',NULL),
    (6,5,greta,math_greta,8,200,'2026-10-03','cancelled',NULL),
    (7,6,greta,math_greta,4,100,'2026-10-02','refunded','2026-10-03T09:00:00Z'),
    (10,4,ona,math_ona,4,100,'2026-09-01','paid',NULL),
    (11,6,greta,math_greta,3,75,'2026-10-06','pending',NULL),
    (12,7,jonas,trial_jonas,1,10,'2026-10-06','pending',NULL)
  ) AS fixture(n,student_n,tutor,subject,lessons,amount,issued,payment_status,paid_at) LOOP
    SELECT * INTO STRICT student_row FROM public.students WHERE id=(prefix || lpad(row_data.student_n::text,12,'0'))::uuid AND organization_id=demo_org;
    source_id := (prefix || lpad((1000+row_data.n)::text,12,'0'))::uuid;
    invoice_id := (prefix || lpad((2000+row_data.n)::text,12,'0'))::uuid;
    IF row_data.n <> 11 THEN
      INSERT INTO public.invoices (id,organization_id,issued_by_user_id,invoice_number,seller_snapshot,buyer_snapshot,issue_date,subtotal,total_amount,status,pdf_meta,created_at)
      VALUES (invoice_id,demo_org,demo_admin,'DEMO-MOK-2026-' || lpad(row_data.n::text,3,'0'),
        jsonb_build_object('name','Pro Klasė QA Demo'),jsonb_build_object('name',student_row.payer_name,'email',student_row.payer_email,'phone',student_row.payer_phone),
        row_data.issued,row_data.amount,row_data.amount,CASE WHEN row_data.payment_status='cancelled' THEN 'cancelled' WHEN row_data.payment_status IN ('paid','refunded') THEN 'paid' ELSE 'issued' END,
        jsonb_build_object('currency','EUR','paymentSourceType','package','paymentSourceId',source_id,'qaFixture','payment-report-20261007'),row_data.issued::timestamptz)
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.invoice_line_items (id,invoice_id,description,quantity,unit_price,total_price,session_ids)
      VALUES ((prefix || lpad((3000+row_data.n)::text,12,'0'))::uuid,invoice_id,'Demo mokėjimo ataskaitos testas',row_data.lessons,row_data.amount/row_data.lessons,row_data.amount,ARRAY[source_id])
      ON CONFLICT (id) DO NOTHING;
    END IF;
    INSERT INTO public.lesson_packages (id,student_id,tutor_id,subject_id,total_lessons,available_lessons,reserved_lessons,completed_lessons,price_per_lesson,total_price,paid,payment_status,paid_at,active,manual_sales_invoice_id,created_at,expires_at)
    VALUES (source_id,student_row.id,row_data.tutor,row_data.subject,row_data.lessons,row_data.lessons,0,0,row_data.amount/row_data.lessons,row_data.amount,
      row_data.payment_status='paid',row_data.payment_status,row_data.paid_at,false,CASE WHEN row_data.n=11 THEN NULL ELSE invoice_id END,row_data.issued::timestamptz,'2026-10-06T20:00:00Z')
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- All lessons are in the past and reminders are stamped; the QA cannot send lesson reminders.
  FOR row_data IN SELECT * FROM (VALUES
    (1,1,ona,trial_ona,'2026-09-08T12:00:00Z'::timestamptz,'completed',1,false),
    (2,1,ona,math_ona,'2026-09-15T12:00:00Z','completed',2,false),
    (3,1,ona,math_ona,'2026-09-22T12:00:00Z','completed',2,false),
    (4,1,ona,math_ona,'2026-09-29T12:00:00Z','cancelled',2,false),
    (5,2,jonas,math_jonas,'2026-10-05T12:00:00Z','completed',3,false),
    (6,2,jonas,math_jonas,'2026-10-06T12:00:00Z','no_show',3,false),
    (7,3,jonas,trial_jonas,'2026-10-06T14:00:00Z','completed',4,false),
    (8,2,jonas,math_jonas,'2026-10-06T15:00:00Z','completed',0,false),
    (9,2,jonas,math_jonas,'2026-10-02T14:00:00Z','completed',0,false),
    (10,7,jonas,trial_jonas,'2026-10-03T14:00:00Z','completed',0,true),
    (11,7,jonas,trial_jonas,'2026-10-06T16:00:00Z','completed',12,false),
    (12,1,ona,math_ona,'2026-09-30T12:00:00Z','cancelled',0,false)
  ) AS fixture(n,student_n,tutor,subject,starts,status,package_n,trial) LOOP
    INSERT INTO public.sessions (id,student_id,tutor_id,subject_id,start_time,end_time,status,paid,payment_status,price,lesson_package_id,created_at,topic,reminder_student_sent,reminder_tutor_sent,reminder_payer_sent,payment_after_lesson_reminder_sent,payment_deadline_warning_sent,is_complimentary)
    VALUES ((prefix || lpad((4000+row_data.n)::text,12,'0'))::uuid,(prefix || lpad(row_data.student_n::text,12,'0'))::uuid,row_data.tutor,row_data.subject,row_data.starts,row_data.starts+interval '45 minutes',row_data.status,
      row_data.status<>'cancelled' AND row_data.package_n<>12,CASE WHEN row_data.status='cancelled' THEN 'cancelled' WHEN row_data.package_n=12 THEN 'pending' ELSE 'paid' END,
      CASE WHEN row_data.subject IN (trial_ona,trial_jonas) THEN 10 ELSE 25 END,CASE WHEN row_data.package_n=0 THEN NULL ELSE (prefix || lpad((1000+row_data.package_n)::text,12,'0'))::uuid END,
      row_data.starts-interval '7 days','Demo: mokėjimų ataskaitos vizualinis testas',true,true,true,true,true,false)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- Standalone lesson and a family invoice with distinct histories for two siblings.
  FOR row_data IN SELECT * FROM (VALUES
    (8,2,25::numeric,'2026-10-05'::date,'2026-10-06T10:00:00Z'::timestamptz,ARRAY[8]),
    (9,2,35,'2026-10-01','2026-10-02T10:00:00Z',ARRAY[9,10])
  ) AS fixture(n,student_n,amount,issued,paid_at,session_ns) LOOP
    SELECT * INTO STRICT student_row FROM public.students WHERE id=(prefix || lpad(row_data.student_n::text,12,'0'))::uuid AND organization_id=demo_org;
    invoice_id := (prefix || lpad((2000+row_data.n)::text,12,'0'))::uuid;
    INSERT INTO public.invoices (id,organization_id,issued_by_user_id,invoice_number,seller_snapshot,buyer_snapshot,issue_date,subtotal,total_amount,status,pdf_meta,created_at)
    VALUES (invoice_id,demo_org,demo_admin,'DEMO-MOK-2026-' || lpad(row_data.n::text,3,'0'),jsonb_build_object('name','Pro Klasė QA Demo'),
      jsonb_build_object('name',student_row.payer_name,'email',student_row.payer_email,'phone',student_row.payer_phone),row_data.issued,row_data.amount,row_data.amount,'paid',
      jsonb_build_object('currency','EUR','paidAt',row_data.paid_at,'qaFixture','payment-report-20261007'),row_data.issued::timestamptz)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.invoice_line_items (id,invoice_id,description,quantity,unit_price,total_price,session_ids)
    VALUES ((prefix || lpad((3000+row_data.n)::text,12,'0'))::uuid,invoice_id,'Demo: atskiros / šeimos pamokos',1,row_data.amount,row_data.amount,
      ARRAY(SELECT (prefix || lpad((4000+n)::text,12,'0'))::uuid FROM unnest(row_data.session_ns) n))
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- 55 historical records prove that an export includes more than the 50 visible rows.
  FOR row_data IN SELECT generate_series(1,55) AS n LOOP
    source_id := (prefix || lpad((5000+row_data.n)::text,12,'0'))::uuid;
    invoice_id := (prefix || lpad((6000+row_data.n)::text,12,'0'))::uuid;
    INSERT INTO public.invoices (id,organization_id,issued_by_user_id,invoice_number,seller_snapshot,buyer_snapshot,issue_date,subtotal,total_amount,status,pdf_meta,created_at)
    VALUES (invoice_id,demo_org,demo_admin,'DEMO-PUSL-2026-' || lpad(row_data.n::text,3,'0'),jsonb_build_object('name','Pro Klasė QA Demo'),
      jsonb_build_object('name','Demo Mokėtojas; su kabutėmis "QA"','email','eksporto.patikra@example.test','phone','+370 600 01999'),
      '2026-09-01',25,25,'paid',jsonb_build_object('currency','EUR','qaFixture','payment-report-20261007'),'2026-09-01T10:00:00Z')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.lesson_packages (id,student_id,tutor_id,subject_id,total_lessons,available_lessons,price_per_lesson,total_price,paid,payment_status,paid_at,active,manual_sales_invoice_id,created_at,expires_at)
    VALUES (source_id,(prefix || lpad(8::text,12,'0'))::uuid,ona,math_ona,1,1,25,25,true,'paid','2026-09-02T10:00:00Z',false,invoice_id,'2026-09-01T10:00:00Z','2026-10-06T20:00:00Z')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.invoice_line_items (id,invoice_id,description,quantity,unit_price,total_price,session_ids)
    VALUES ((prefix || lpad((7000+row_data.n)::text,12,'0'))::uuid,invoice_id,'Demo: eksporto puslapiavimo testas',1,25,25,ARRAY[source_id])
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END;
$qa$;
COMMIT;

SELECT json_build_object(
  'organization','Pro Klasė QA Demo',
  'students',(SELECT count(*) FROM public.students WHERE id::text LIKE 'b0a07107-7e57-4000-8000-%' AND organization_id='b0a00000-7e57-4000-8000-000000000001'),
  'invoices',(SELECT count(*) FROM public.invoices WHERE id::text LIKE 'b0a07107-7e57-4000-8000-%' AND organization_id='b0a00000-7e57-4000-8000-000000000001'),
  'packages',(SELECT count(*) FROM public.lesson_packages p JOIN public.students s ON s.id=p.student_id WHERE p.id::text LIKE 'b0a07107-7e57-4000-8000-%' AND s.organization_id='b0a00000-7e57-4000-8000-000000000001'),
  'sessions',(SELECT count(*) FROM public.sessions x JOIN public.students s ON s.id=x.student_id WHERE x.id::text LIKE 'b0a07107-7e57-4000-8000-%' AND s.organization_id='b0a00000-7e57-4000-8000-000000000001')
);
