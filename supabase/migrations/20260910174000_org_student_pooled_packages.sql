-- One commercial package; items are the sale breakdown, not separate balances.
ALTER TABLE public.lesson_packages
  ADD COLUMN IF NOT EXISTS pool_organization_id uuid REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS pool_identity_key text,
  ADD COLUMN IF NOT EXISTS pool_email_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS pool_email_sent_at timestamptz;

-- Preview tokens and quoted session ids are server-only fulfillment state. Keeping
-- them outside lesson_packages prevents existing row policies from exposing a
-- child's sibling tutor rows or schedule identifiers through direct table reads.
CREATE TABLE IF NOT EXISTS public.pooled_package_quotes (
  package_id uuid PRIMARY KEY REFERENCES public.lesson_packages(id) ON DELETE CASCADE,
  preview_token text NOT NULL,
  session_ids uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pooled_package_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pooled_package_quotes FROM PUBLIC, anon, authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS lesson_packages_pool_month_unique
  ON public.lesson_packages(pool_organization_id, pool_identity_key, billing_period_end)
  WHERE pool_organization_id IS NOT NULL AND payment_status <> 'cancelled';

CREATE OR REPLACE FUNCTION public.package_student_identity(p_student public.students)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT md5(CASE WHEN p_student.linked_user_id IS NOT NULL THEN 'u:' || p_student.linked_user_id::text
    WHEN nullif(trim(p_student.email), '') IS NOT NULL THEN 'e:' || lower(trim(p_student.email))
    ELSE 's:' || p_student.id::text END || ':' || lower(regexp_replace(trim(coalesce(p_student.full_name, '')), '\s+', ' ', 'g')));
$$;

CREATE OR REPLACE FUNCTION public.create_org_student_package(
  p_student_id uuid, p_org_id uuid, p_student_ids uuid[], p_items jsonb,
  p_unit_price numeric, p_period_start date, p_period_end date, p_preview_token text, p_session_ids uuid[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_student public.students; v_id uuid; v_total integer; v_item jsonb;
BEGIN
  IF p_org_id NOT IN (
    '3422031d-6e21-424d-980b-35a9c6d7b8f1'::uuid,
    'b0a00000-7e57-4000-8000-000000000001'::uuid
  ) THEN RAISE EXCEPTION 'Pooled packages are not enabled for this organization'; END IF;
  SELECT * INTO STRICT v_student FROM students WHERE id = p_student_id AND organization_id = p_org_id AND detached_at IS NULL;
  IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=v_student.tutor_id AND organization_id=p_org_id) THEN
    RAISE EXCEPTION 'Student anchor tutor is outside the organization';
  END IF;
  IF p_student_id <> ALL(p_student_ids) OR cardinality(p_student_ids) < 1 OR EXISTS (
    SELECT 1 FROM unnest(p_student_ids) AS ids(student_id) LEFT JOIN students s ON s.id = ids.student_id
    WHERE s.id IS NULL OR s.organization_id IS DISTINCT FROM p_org_id OR s.detached_at IS NOT NULL
      OR package_student_identity(s) <> package_student_identity(v_student)
  ) THEN RAISE EXCEPTION 'Invalid student identity'; END IF;
  IF p_period_start <> date_trunc('month', p_period_start)::date
    OR p_period_end <> (date_trunc('month', p_period_start) + interval '1 month - 1 day')::date
    OR p_unit_price <= 0 OR p_unit_price <> round(p_unit_price, 2) THEN RAISE EXCEPTION 'Invalid package terms'; END IF;
  SELECT sum((item->>'totalLessons')::integer) INTO v_total FROM jsonb_array_elements(p_items) item;
  IF v_total IS NULL OR v_total NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid credit total'; END IF;
  IF cardinality(p_session_ids) <> v_total OR (SELECT count(DISTINCT id) FROM unnest(p_session_ids) id) <> v_total THEN
    RAISE EXCEPTION 'Invalid session total'; END IF;
  PERFORM 1 FROM sessions WHERE id=ANY(p_session_ids) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM sessions s JOIN subjects sub ON sub.id=s.subject_id JOIN profiles t ON t.id=s.tutor_id
    WHERE s.id=ANY(p_session_ids) AND s.student_id=ANY(p_student_ids) AND t.organization_id=p_org_id
      AND sub.tutor_id=s.tutor_id AND NOT coalesce(sub.is_trial,false)
      AND s.status IN ('active','completed') AND NOT s.paid AND s.lesson_package_id IS NULL
      AND NOT coalesce(s.is_complimentary,false) AND NOT coalesce(s.is_makeup,false)
      AND (s.start_time AT TIME ZONE 'Europe/Vilnius')::date BETWEEN p_period_start AND p_period_end) <> v_total
    THEN RAISE EXCEPTION 'Schedule changed; refresh the package preview'; END IF;
  IF (SELECT count(*) FROM sessions s JOIN subjects sub ON sub.id=s.subject_id JOIN profiles t ON t.id=s.tutor_id
    WHERE s.student_id=ANY(p_student_ids) AND t.organization_id=p_org_id
      AND sub.tutor_id=s.tutor_id AND NOT coalesce(sub.is_trial,false)
      AND s.status IN ('active','completed') AND NOT s.paid AND s.lesson_package_id IS NULL
      AND NOT coalesce(s.is_complimentary,false) AND NOT coalesce(s.is_makeup,false)
      AND (s.start_time AT TIME ZONE 'Europe/Vilnius')::date BETWEEN p_period_start AND p_period_end) <> v_total
    THEN RAISE EXCEPTION 'Schedule changed; refresh the package preview'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_item->>'totalLessons')::integer <= 0 OR NOT EXISTS (
      SELECT 1 FROM subjects s JOIN profiles t ON t.id=s.tutor_id
      WHERE s.id=(v_item->>'subjectId')::uuid AND t.organization_id=p_org_id
    ) THEN RAISE EXCEPTION 'Invalid package subject'; END IF;
    IF (SELECT count(*) FROM sessions WHERE id=ANY(p_session_ids) AND subject_id=(v_item->>'subjectId')::uuid)
      <> (v_item->>'totalLessons')::integer THEN RAISE EXCEPTION 'Subject breakdown does not match sessions'; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT item->>'subjectId') FROM jsonb_array_elements(p_items) item) <> jsonb_array_length(p_items)
    THEN RAISE EXCEPTION 'Duplicate subject'; END IF;
  -- Serialize creation for this organization, including requests from sibling identity rows.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text || package_student_identity(v_student), 0));
  SELECT id INTO v_id FROM lesson_packages WHERE pool_organization_id=p_org_id
    AND pool_identity_key=package_student_identity(v_student) AND billing_period_end=p_period_end AND payment_status <> 'cancelled';
  IF v_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pooled_package_quotes WHERE package_id=v_id AND preview_token=p_preview_token) THEN
      RAISE EXCEPTION 'A package already exists for this student and period';
    END IF;
    RETURN v_id;
  END IF;
  INSERT INTO lesson_packages(tutor_id,student_id,subject_id,total_lessons,available_lessons,reserved_lessons,completed_lessons,
    price_per_lesson,total_price,paid,payment_status,active,payment_method,billing_period_start,billing_period_end,expires_at,
    pool_organization_id,pool_identity_key)
  VALUES(v_student.tutor_id,p_student_id,NULL,v_total,v_total,0,0,p_unit_price,v_total*p_unit_price,false,'pending',true,'stripe',
    p_period_start,p_period_end,((p_period_end+1)::timestamp AT TIME ZONE 'Europe/Vilnius'),p_org_id,package_student_identity(v_student))
  RETURNING id INTO v_id;
  INSERT INTO pooled_package_quotes(package_id,preview_token,session_ids) VALUES(v_id,p_preview_token,p_session_ids);
  INSERT INTO lesson_package_items(package_id,subject_id,total_lessons,available_lessons,reserved_lessons,completed_lessons,price_per_lesson,total_price,position)
    SELECT v_id,(item->>'subjectId')::uuid,(item->>'totalLessons')::integer,(item->>'totalLessons')::integer,0,0,
      p_unit_price,(item->>'totalLessons')::integer*p_unit_price,ordinality-1
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS x(item,ordinality);
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.create_org_student_package(uuid,uuid,uuid[],jsonb,numeric,date,date,text,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_org_student_package(uuid,uuid,uuid[],jsonb,numeric,date,date,text,uuid[]) TO service_role;

-- Counters for pooled packages derive from session allocation, never item quotas.
CREATE OR REPLACE FUNCTION public.protect_pooled_package() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_reserved integer; v_completed integer;
BEGIN
  IF NEW.pool_organization_id IS NULL AND (TG_OP='INSERT' OR OLD.pool_organization_id IS NULL) THEN RETURN NEW; END IF;
  IF NEW.pool_organization_id NOT IN (
    '3422031d-6e21-424d-980b-35a9c6d7b8f1'::uuid,
    'b0a00000-7e57-4000-8000-000000000001'::uuid
  ) THEN RAISE EXCEPTION 'Pooled packages are not enabled for this organization'; END IF;
  IF coalesce(auth.role(),'') <> 'service_role' AND pg_trigger_depth() < 2 AND NOT (
    TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['available_lessons','reserved_lessons','completed_lessons','updated_at']) =
      (to_jsonb(OLD)-ARRAY['available_lessons','reserved_lessons','completed_lessons','updated_at'])
  ) THEN
    RAISE EXCEPTION 'Pooled packages must be changed through the server';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.pool_organization_id IS DISTINCT FROM OLD.pool_organization_id
      OR NEW.total_lessons <> OLD.total_lessons OR NEW.pool_identity_key IS DISTINCT FROM OLD.pool_identity_key
      OR NEW.price_per_lesson IS DISTINCT FROM OLD.price_per_lesson OR NEW.total_price <> OLD.total_price
      OR NEW.student_id <> OLD.student_id OR NEW.tutor_id <> OLD.tutor_id THEN RAISE EXCEPTION 'Pooled package terms are immutable'; END IF;
    SELECT count(*) FILTER (WHERE status='active'), count(*) FILTER (WHERE status IN ('completed','no_show') OR (status='cancelled' AND is_late_cancelled))
      INTO v_reserved,v_completed FROM sessions WHERE lesson_package_id=NEW.id;
    NEW.reserved_lessons := v_reserved; NEW.completed_lessons := v_completed;
    NEW.available_lessons := NEW.total_lessons-v_reserved-v_completed;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS protect_pooled_package ON public.lesson_packages;
CREATE TRIGGER protect_pooled_package BEFORE INSERT OR UPDATE ON public.lesson_packages
FOR EACH ROW EXECUTE FUNCTION public.protect_pooled_package();

CREATE OR REPLACE FUNCTION public.allocate_pooled_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_pkg public.lesson_packages; v_student public.students; v_count integer;
BEGIN
  IF NEW.lesson_package_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_pkg FROM lesson_packages WHERE id=NEW.lesson_package_id FOR UPDATE;
  IF v_pkg.pool_organization_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_student FROM students WHERE id=NEW.student_id;
  IF v_student.organization_id IS DISTINCT FROM v_pkg.pool_organization_id OR v_student.detached_at IS NOT NULL
    OR package_student_identity(v_student) IS DISTINCT FROM v_pkg.pool_identity_key
    OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=NEW.tutor_id AND organization_id=v_pkg.pool_organization_id)
    OR NOT EXISTS(SELECT 1 FROM subjects WHERE id=NEW.subject_id AND tutor_id=NEW.tutor_id AND NOT coalesce(is_trial,false))
    OR coalesce(NEW.is_complimentary,false) OR coalesce(NEW.is_makeup,false) THEN RAISE EXCEPTION 'Session outside package identity or organization'; END IF;
  IF TG_OP='INSERT' OR OLD.lesson_package_id IS DISTINCT FROM NEW.lesson_package_id OR OLD.start_time IS DISTINCT FROM NEW.start_time
    OR (OLD.status='cancelled' AND NEW.status IN ('active','completed','no_show')) THEN
    IF NOT v_pkg.paid OR NOT v_pkg.active OR v_pkg.payment_status <> 'paid' OR (v_pkg.expires_at <= now() AND pg_trigger_depth() < 2)
      OR (NEW.start_time AT TIME ZONE 'Europe/Vilnius')::date NOT BETWEEN v_pkg.billing_period_start AND v_pkg.billing_period_end
      THEN RAISE EXCEPTION 'Package is unavailable for this lesson'; END IF;
  END IF;
  SELECT count(*) INTO v_count FROM sessions WHERE lesson_package_id=v_pkg.id AND id<>NEW.id
    AND (status IN ('active','completed','no_show') OR (status='cancelled' AND is_late_cancelled));
  IF (NEW.status IN ('active','completed','no_show') OR (NEW.status='cancelled' AND NEW.is_late_cancelled)) AND v_count>=v_pkg.total_lessons
    THEN RAISE EXCEPTION 'No pooled credits available'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS allocate_pooled_session ON public.sessions;
CREATE TRIGGER allocate_pooled_session BEFORE INSERT OR UPDATE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.allocate_pooled_session();

CREATE OR REPLACE FUNCTION public.recount_pooled_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN UPDATE lesson_packages SET available_lessons=available_lessons WHERE id=OLD.lesson_package_id AND pool_organization_id IS NOT NULL; END IF;
  IF TG_OP<>'DELETE' THEN UPDATE lesson_packages SET available_lessons=available_lessons WHERE id=NEW.lesson_package_id AND pool_organization_id IS NOT NULL; END IF;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS recount_pooled_session ON public.sessions;
CREATE TRIGGER recount_pooled_session AFTER INSERT OR UPDATE OR DELETE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.recount_pooled_session();

-- On confirmed payment apply the pool to still eligible quoted lessons. Changed or
-- cancelled lessons leave fungible credits available for a later booking.
CREATE OR REPLACE FUNCTION public.apply_paid_pooled_package() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_session_ids uuid[];
BEGIN
  IF NEW.pool_organization_id IS NOT NULL AND NEW.paid AND NOT OLD.paid THEN
    SELECT session_ids INTO v_session_ids FROM pooled_package_quotes WHERE package_id=NEW.id;
    IF v_session_ids IS NULL THEN RAISE EXCEPTION 'Pooled package quote is missing'; END IF;
    UPDATE sessions SET lesson_package_id=NEW.id, paid=true, payment_status='paid'
      WHERE id=ANY(v_session_ids) AND lesson_package_id IS NULL AND NOT paid
        AND status IN ('active','completed') AND NOT coalesce(is_complimentary,false) AND NOT coalesce(is_makeup,false)
        AND (start_time AT TIME ZONE 'Europe/Vilnius')::date BETWEEN NEW.billing_period_start AND NEW.billing_period_end
        AND EXISTS (
          SELECT 1 FROM students student
          WHERE student.id=sessions.student_id
            AND student.organization_id=NEW.pool_organization_id
            AND student.detached_at IS NULL
            AND package_student_identity(student)=NEW.pool_identity_key
        )
        AND EXISTS (
          SELECT 1 FROM profiles tutor
          WHERE tutor.id=sessions.tutor_id AND tutor.organization_id=NEW.pool_organization_id
        )
        AND EXISTS (
          SELECT 1 FROM subjects subject
          WHERE subject.id=sessions.subject_id AND subject.tutor_id=sessions.tutor_id
            AND NOT coalesce(subject.is_trial,false)
        );
  END IF;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS apply_paid_pooled_package ON public.lesson_packages;
CREATE TRIGGER apply_paid_pooled_package AFTER UPDATE OF paid ON public.lesson_packages
FOR EACH ROW EXECUTE FUNCTION public.apply_paid_pooled_package();

DROP POLICY IF EXISTS pooled_package_member_read ON public.lesson_packages;

-- The definer function returns a fixed safe projection and performs its own
-- caller check. No lesson_packages policy is added, so direct reads cannot leak
-- internal pooled identity or quote state to another tutor pairing.
CREATE OR REPLACE FUNCTION public.get_pooled_packages_for_student(p_student_id uuid)
RETURNS TABLE (
  id uuid,
  tutor_id uuid,
  student_id uuid,
  subject_id uuid,
  total_lessons integer,
  available_lessons integer,
  reserved_lessons integer,
  completed_lessons integer,
  expires_at timestamptz,
  pool_organization_id uuid,
  billing_period_start date,
  billing_period_end date
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.id, p.tutor_id, p.student_id, p.subject_id, p.total_lessons,
    p.available_lessons, p.reserved_lessons, p.completed_lessons, p.expires_at,
    p.pool_organization_id, p.billing_period_start, p.billing_period_end
  FROM lesson_packages p JOIN students s ON s.id=p_student_id
    AND s.organization_id=p.pool_organization_id AND package_student_identity(s)=p.pool_identity_key
  WHERE s.detached_at IS NULL AND p.paid AND p.active AND p.payment_status='paid'
    AND p.available_lessons>0 AND p.expires_at>now()
    AND (
      coalesce(auth.role(),'')='service_role'
      OR s.tutor_id=auth.uid()
      OR s.linked_user_id=auth.uid()
      OR EXISTS (SELECT 1 FROM organization_admins oa
        WHERE oa.organization_id=s.organization_id AND oa.user_id=auth.uid())
    )
  ORDER BY p.created_at;
$$;
REVOKE ALL ON FUNCTION public.get_pooled_packages_for_student(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_pooled_packages_for_student(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.protect_pooled_package_items() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF EXISTS(SELECT 1 FROM lesson_packages WHERE id=NEW.package_id AND pool_organization_id IS NOT NULL)
      AND coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Pooled package sale breakdown is immutable'; END IF;
    RETURN NEW;
  END IF;
  IF EXISTS(SELECT 1 FROM lesson_packages WHERE id=OLD.package_id AND pool_organization_id IS NOT NULL) THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Pooled package sale breakdown is immutable'; END IF;
    IF (to_jsonb(NEW)-ARRAY['available_lessons','reserved_lessons','completed_lessons','updated_at']) IS DISTINCT FROM
      (to_jsonb(OLD)-ARRAY['available_lessons','reserved_lessons','completed_lessons','updated_at']) THEN
      RAISE EXCEPTION 'Pooled package sale breakdown is immutable';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS protect_pooled_package_items ON public.lesson_package_items;
CREATE TRIGGER protect_pooled_package_items BEFORE INSERT OR UPDATE OR DELETE ON public.lesson_package_items
FOR EACH ROW EXECUTE FUNCTION public.protect_pooled_package_items();
