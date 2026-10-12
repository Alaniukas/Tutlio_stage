-- Tutor proposals keep the current booking until its client approves. Deploy
-- this migration together with the request API and calendar UI in the next release.
CREATE TABLE public.lesson_reschedule_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('single', 'future')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  reason text NOT NULL CHECK (length(trim(reason)) >= 5),
  requested_by text NOT NULL CHECK (requested_by IN ('tutor', 'student')),
  changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'array'),
  recurrence_before jsonb NOT NULL DEFAULT '[]',
  session_fields jsonb NOT NULL DEFAULT '{}',
  leave_free_time boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  resolved_at timestamptz,
  decision_notified_at timestamptz,
  email_ready boolean NOT NULL DEFAULT false
);
CREATE INDEX lesson_reschedule_requests_tutor_created
  ON public.lesson_reschedule_requests(tutor_id, created_at DESC);
CREATE INDEX lesson_reschedule_requests_pending
  ON public.lesson_reschedule_requests(tutor_id) WHERE status = 'pending';

CREATE TABLE public.lesson_reschedule_recipients (
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.lesson_reschedule_requests(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(trim(email)) AND email <> ''),
  student_ids uuid[] NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  responded_at timestamptz,
  PRIMARY KEY (request_id, email)
);
ALTER TABLE public.lesson_reschedule_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_reschedule_recipients ENABLE ROW LEVEL SECURITY;
-- Tokens, parent contacts and snapshots never pass through the browser Data API.
REVOKE ALL ON public.lesson_reschedule_requests, public.lesson_reschedule_recipients FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.lesson_reschedule_requests, public.lesson_reschedule_recipients TO service_role;

CREATE SCHEMA IF NOT EXISTS private;
CREATE FUNCTION private.lesson_reschedule_snapshot(s public.sessions) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' SET timezone = 'UTC' AS $$
  SELECT jsonb_build_object(
    'start', s.start_time, 'end', s.end_time, 'status', s.status,
    'tutor', s.tutor_id, 'student', s.student_id, 'subject', s.subject_id,
    'recurring', s.recurring_session_id, 'package', s.lesson_package_id,
    'topic', s.topic, 'meeting_link', s.meeting_link, 'price', s.price,
    'tutor_comment', s.tutor_comment, 'show_comment_to_student', s.show_comment_to_student,
    'show_comment_to_parent', s.show_comment_to_parent
  );
$$;
CREATE FUNCTION private.lesson_reschedule_recurrence_snapshot(r public.recurring_individual_sessions) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT to_jsonb(r) - 'last_materialized_at' - 'updated_at' - 'created_at';
$$;
CREATE FUNCTION private.lesson_reschedule_client_email(s public.students) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT lower(trim(COALESCE(NULLIF(trim(s.payer_email), ''),
    (SELECT NULLIF(trim(p.email), '') FROM public.parent_profiles p WHERE p.user_id = s.parent_user_id LIMIT 1),
    CASE WHEN s.payment_payer = 'student' THEN NULLIF(trim(s.email), '') END, '')));
$$;

CREATE FUNCTION private.lesson_reschedule_series_start(
  p_old timestamptz, p_anchor_old timestamptz, p_anchor_new timestamptz, p_frequency text
) RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE old_local timestamp := p_old AT TIME ZONE 'Europe/Vilnius';
  anchor_old timestamp := p_anchor_old AT TIME ZONE 'Europe/Vilnius';
  anchor_new timestamp := p_anchor_new AT TIME ZONE 'Europe/Vilnius'; months integer;
BEGIN
  IF p_frequency = 'monthly' THEN
    months := (extract(year FROM old_local) - extract(year FROM anchor_old)) * 12
      + extract(month FROM old_local) - extract(month FROM anchor_old);
    -- Match the rolling materializer's anchor-based month-end clamping.
    RETURN (anchor_new + make_interval(months => months)) AT TIME ZONE 'Europe/Vilnius';
  END IF;
  RETURN (old_local + (anchor_new - anchor_old)) AT TIME ZONE 'Europe/Vilnius';
END;
$$;

CREATE FUNCTION private.validate_lesson_reschedule_changes(p_tutor uuid, p_changes jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE c jsonb;
BEGIN
  IF jsonb_array_length(p_changes) = 0 THEN RAISE EXCEPTION 'reschedule_changed'; END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(p_changes) LOOP
    IF (c->>'newStart')::timestamptz <= now()
      OR (c->>'newEnd')::timestamptz <= (c->>'newStart')::timestamptz THEN
      RAISE EXCEPTION 'reschedule_expired';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.sessions s WHERE s.tutor_id = p_tutor AND s.status <> 'cancelled'
        AND s.start_time < (c->>'newEnd')::timestamptz AND s.end_time > (c->>'newStart')::timestamptz
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_changes) x WHERE (x->>'id')::uuid = s.id)
    ) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_changes) x
      WHERE x->>'id' <> c->>'id'
        AND (x->>'newStart')::timestamptz < (c->>'newEnd')::timestamptz
        AND (x->>'newEnd')::timestamptz > (c->>'newStart')::timestamptz
        -- Multiple student rows of the same group occurrence share its slot.
        AND (x->>'oldStart', x->>'oldEnd') IS DISTINCT FROM (c->>'oldStart', c->>'oldEnd')
    ) THEN RAISE EXCEPTION 'reschedule_conflict'; END IF;
  END LOOP;
END;
$$;

-- These two RPCs are service-role-only and SECURITY INVOKER. The API verifies
-- the tutor JWT or the per-client signed link before invoking either operation.
CREATE FUNCTION public.create_lesson_reschedule_request(
  p_tutor uuid, p_session uuid, p_expected_start timestamptz, p_expected_end timestamptz,
  p_start timestamptz, p_end timestamptz, p_scope text, p_reason text,
  p_requested_by text, p_fields jsonb DEFAULT '{}', p_leave_free_time boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  source public.sessions; org_id uuid; is_group boolean; recurrence_ids uuid[];
  v_changes jsonb; v_recurrence_before jsonb; v_request_id uuid;
  recipient text; row public.students; features jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('lesson-reschedule:' || p_tutor::text, 0));
  SELECT * INTO source FROM public.sessions WHERE id = p_session AND tutor_id = p_tutor FOR UPDATE;
  SELECT p.organization_id, o.features INTO org_id, features FROM public.profiles p
    JOIN public.organizations o ON o.id = p.organization_id WHERE p.id = p_tutor AND o.entity_type = 'company';
  IF source.id IS NULL OR source.recurring_session_id IS NULL OR source.status <> 'active'
    OR org_id IS NULL OR COALESCE(features->>'tutor_recurring_reschedule_approval', 'false') <> 'true'
    OR NOT EXISTS (SELECT 1 FROM public.students WHERE id = source.student_id AND organization_id = org_id)
    THEN RAISE EXCEPTION 'reschedule_unavailable'; END IF;
  IF source.start_time IS DISTINCT FROM p_expected_start OR source.end_time IS DISTINCT FROM p_expected_end
    THEN RAISE EXCEPTION 'reschedule_changed'; END IF;
  IF p_scope NOT IN ('single', 'future') OR length(trim(p_reason)) < 5
    OR p_requested_by NOT IN ('tutor', 'student') OR p_start IS NULL OR p_end IS NULL
    OR p_start = source.start_time OR p_end <= p_start
    OR p_end - p_start > interval '4 hours' THEN RAISE EXCEPTION 'reschedule_invalid'; END IF;
  IF LEAST(source.start_time, p_start) <= now() THEN RAISE EXCEPTION 'reschedule_expired'; END IF;
  IF jsonb_typeof(p_fields) <> 'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_fields) k WHERE k NOT IN
      ('topic', 'meeting_link', 'price', 'tutor_comment', 'show_comment_to_student', 'show_comment_to_parent')
  ) THEN RAISE EXCEPTION 'reschedule_invalid'; END IF;
  SELECT COALESCE(s.is_group, false) INTO is_group FROM public.subjects s WHERE s.id = source.subject_id;
  SELECT array_agg(DISTINCT s.recurring_session_id) FILTER (WHERE s.recurring_session_id IS NOT NULL)
    INTO recurrence_ids FROM public.sessions s
    WHERE s.tutor_id = p_tutor AND (s.status = 'active' OR (p_scope = 'future' AND s.status = 'cancelled'
      AND EXISTS(SELECT 1 FROM public.sessions later WHERE later.recurring_session_id = s.recurring_session_id
        AND later.tutor_id = p_tutor AND later.status = 'active' AND later.start_time > source.start_time))) AND
      (s.id = source.id OR (is_group AND s.subject_id = source.subject_id
        AND s.start_time = source.start_time AND s.end_time = source.end_time));
  -- Use Vilnius wall-clock shifts so weekly lessons keep their time across DST.
  SELECT jsonb_agg(jsonb_build_object(
    'id', s.id, 'studentId', s.student_id, 'subjectId', s.subject_id, 'recurringId', s.recurring_session_id,
    'oldStart', s.start_time, 'oldEnd', s.end_time,
    'newStart', private.lesson_reschedule_series_start(s.start_time, source.start_time, p_start, CASE WHEN p_scope = 'future' THEN r.frequency END),
    'newEnd', private.lesson_reschedule_series_start(s.start_time, source.start_time, p_start, CASE WHEN p_scope = 'future' THEN r.frequency END) + (p_end - p_start),
    'before', private.lesson_reschedule_snapshot(s)
  ) ORDER BY s.start_time, s.id) INTO v_changes FROM public.sessions s
  LEFT JOIN public.recurring_individual_sessions r ON r.id = s.recurring_session_id
  WHERE s.tutor_id = p_tutor AND s.status = 'active' AND
    ((p_scope = 'future' AND s.recurring_session_id = ANY(recurrence_ids) AND s.start_time >= source.start_time)
      OR (p_scope = 'single' AND (s.id = source.id OR (is_group AND s.subject_id = source.subject_id
        AND s.start_time = source.start_time AND s.end_time = source.end_time))));
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_changes) c JOIN public.students s ON s.id = (c->>'studentId')::uuid
    WHERE s.organization_id IS DISTINCT FROM org_id) THEN RAISE EXCEPTION 'reschedule_unavailable'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_changes) c JOIN public.recurring_individual_sessions r ON r.id = (c->>'recurringId')::uuid
    WHERE r.tutor_id IS DISTINCT FROM p_tutor OR r.student_id IS DISTINCT FROM (c->>'studentId')::uuid)
    THEN RAISE EXCEPTION 'reschedule_changed'; END IF;
  IF p_scope = 'single' AND features->>'monthly_packages' = 'true' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_changes) c JOIN public.sessions s ON s.id = (c->>'id')::uuid
    WHERE s.lesson_package_id IS NOT NULL
      AND date_trunc('month', COALESCE(s.original_start_time, s.start_time) AT TIME ZONE 'Europe/Vilnius')
        <> date_trunc('month', (c->>'newStart')::timestamptz AT TIME ZONE 'Europe/Vilnius')
  ) THEN RAISE EXCEPTION 'reschedule_same_month'; END IF;
  PERFORM private.validate_lesson_reschedule_changes(p_tutor, v_changes);
  UPDATE public.lesson_reschedule_requests SET status = 'expired', resolved_at = now()
    WHERE tutor_id = p_tutor AND status = 'pending' AND expires_at <= now();
  UPDATE public.lesson_reschedule_requests r SET status = 'cancelled', resolved_at = now()
    WHERE r.tutor_id = p_tutor AND r.status = 'pending' AND (EXISTS (
      SELECT 1 FROM jsonb_array_elements(r.changes) c LEFT JOIN public.sessions s ON s.id = (c->>'id')::uuid
      WHERE s.id IS NULL OR private.lesson_reschedule_snapshot(s) IS DISTINCT FROM c->'before'
    ) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(r.recurrence_before) c LEFT JOIN public.recurring_individual_sessions t ON t.id = (c->>'id')::uuid
      WHERE t.id IS NULL OR private.lesson_reschedule_recurrence_snapshot(t) IS DISTINCT FROM c->'before'
    ) OR EXISTS (
      SELECT 1 FROM public.lesson_reschedule_recipients a CROSS JOIN LATERAL unnest(a.student_ids) AS child(student_id)
      LEFT JOIN public.students s ON s.id = child.student_id WHERE a.request_id = r.id
        AND (s.id IS NULL OR s.organization_id IS DISTINCT FROM r.organization_id
          OR private.lesson_reschedule_client_email(s) IS DISTINCT FROM a.email)
    ));
  IF EXISTS (SELECT 1 FROM public.lesson_reschedule_requests r, jsonb_array_elements(r.changes) old_c,
    jsonb_array_elements(v_changes) new_c WHERE r.tutor_id = p_tutor AND r.status = 'pending'
    AND (old_c->>'id' = new_c->>'id' OR (old_c->>'recurringId' IS NOT NULL
      AND old_c->>'recurringId' = new_c->>'recurringId' AND (r.scope = 'future' OR p_scope = 'future')))
  ) THEN RAISE EXCEPTION 'reschedule_pending'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id,
    'before', private.lesson_reschedule_recurrence_snapshot(r))), '[]') INTO v_recurrence_before
    FROM public.recurring_individual_sessions r WHERE r.id = ANY(recurrence_ids) AND r.active;
  IF jsonb_array_length(v_recurrence_before) <> cardinality(recurrence_ids) THEN RAISE EXCEPTION 'reschedule_changed'; END IF;
  INSERT INTO public.lesson_reschedule_requests(organization_id, tutor_id, session_id, scope, reason,
    requested_by, changes, recurrence_before, session_fields, leave_free_time, expires_at)
  VALUES (org_id, p_tutor, p_session, p_scope, trim(p_reason), p_requested_by, v_changes,
    v_recurrence_before, p_fields, p_leave_free_time, LEAST(now() + interval '7 days', source.start_time, p_start))
    RETURNING id INTO v_request_id;
  FOR row IN SELECT DISTINCT s.* FROM public.students s JOIN jsonb_array_elements(v_changes) c ON s.id = (c->>'studentId')::uuid LOOP
    recipient := private.lesson_reschedule_client_email(row);
    IF recipient = '' THEN RAISE EXCEPTION 'reschedule_no_contact'; END IF;
    INSERT INTO public.lesson_reschedule_recipients(request_id, email, student_ids)
      VALUES(v_request_id, recipient, ARRAY[row.id]) ON CONFLICT(request_id, email)
      DO UPDATE SET student_ids = public.lesson_reschedule_recipients.student_ids || EXCLUDED.student_ids;
  END LOOP;
  RETURN v_request_id;
END;
$$;

CREATE FUNCTION public.respond_lesson_reschedule_request(p_request uuid, p_email text, p_decision text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  request public.lesson_reschedule_requests; recipient public.lesson_reschedule_recipients;
  c jsonb; live public.sessions; template public.recurring_individual_sessions;
  exclusion record;
  all_changes jsonb; shift interval; duration interval; source_change jsonb;
BEGIN
  SELECT tutor_id INTO request.tutor_id FROM public.lesson_reschedule_requests WHERE id = p_request;
  PERFORM pg_advisory_xact_lock(hashtextextended('lesson-reschedule:' || request.tutor_id::text, 0));
  SELECT * INTO request FROM public.lesson_reschedule_requests WHERE id = p_request FOR UPDATE;
  SELECT * INTO recipient FROM public.lesson_reschedule_recipients WHERE request_id = p_request AND email = p_email FOR UPDATE;
  IF request.id IS NULL OR recipient.request_id IS NULL OR p_decision NOT IN ('approved', 'rejected')
    THEN RAISE EXCEPTION 'reschedule_unavailable'; END IF;
  IF request.status <> 'pending' THEN RETURN jsonb_build_object('status', request.status, 'changed', false); END IF;
  IF NOT request.email_ready THEN RAISE EXCEPTION 'reschedule_unavailable'; END IF;
  IF request.expires_at <= now() THEN
    UPDATE public.lesson_reschedule_requests SET status = 'expired', resolved_at = now() WHERE id = p_request;
    RETURN jsonb_build_object('status', 'expired', 'changed', true);
  END IF;
  IF EXISTS(SELECT 1 FROM unnest(recipient.student_ids) AS child(student_id) LEFT JOIN public.students s ON s.id = child.student_id
    WHERE s.id IS NULL OR s.organization_id IS DISTINCT FROM request.organization_id
      OR private.lesson_reschedule_client_email(s) IS DISTINCT FROM p_email)
    THEN RAISE EXCEPTION 'reschedule_changed'; END IF;
  IF recipient.status <> 'pending' THEN RETURN jsonb_build_object('status', 'pending', 'changed', false); END IF;
  IF p_decision = 'rejected' THEN
    UPDATE public.lesson_reschedule_recipients SET status = 'rejected', responded_at = now() WHERE request_id = p_request AND email = p_email;
    UPDATE public.lesson_reschedule_requests SET status = 'rejected', resolved_at = now() WHERE id = p_request;
    RETURN jsonb_build_object('status', 'rejected', 'changed', true);
  END IF;
  UPDATE public.lesson_reschedule_recipients SET status = 'approved', responded_at = now() WHERE request_id = p_request AND email = p_email;
  IF EXISTS(SELECT 1 FROM public.lesson_reschedule_recipients WHERE request_id = p_request AND status <> 'approved')
    THEN RETURN jsonb_build_object('status', 'pending', 'changed', true); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('lesson-reschedule:' || request.tutor_id::text, 0));
  IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.organizations o ON o.id = p.organization_id
    WHERE p.id = request.tutor_id AND p.organization_id = request.organization_id
      AND o.features->>'tutor_recurring_reschedule_approval' = 'true') THEN RAISE EXCEPTION 'reschedule_changed'; END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(request.changes) LOOP
    SELECT * INTO live FROM public.sessions WHERE id = (c->>'id')::uuid FOR UPDATE;
    IF live.id IS NULL OR private.lesson_reschedule_snapshot(live) IS DISTINCT FROM c->'before'
      OR NOT EXISTS(SELECT 1 FROM public.students s WHERE s.id = live.student_id AND s.organization_id = request.organization_id)
      THEN RAISE EXCEPTION 'reschedule_changed'; END IF;
  END LOOP;
  FOR c IN SELECT value FROM jsonb_array_elements(request.recurrence_before) LOOP
    SELECT * INTO template FROM public.recurring_individual_sessions WHERE id = (c->>'id')::uuid FOR UPDATE;
    IF template.id IS NULL OR private.lesson_reschedule_recurrence_snapshot(template) IS DISTINCT FROM c->'before'
      THEN RAISE EXCEPTION 'reschedule_changed'; END IF;
  END LOOP;
  -- Also verify every approver is still the client for their children.
  IF EXISTS(SELECT 1 FROM public.lesson_reschedule_recipients a CROSS JOIN LATERAL unnest(a.student_ids) AS child(student_id)
    LEFT JOIN public.students s ON s.id = child.student_id WHERE a.request_id = p_request
      AND (s.id IS NULL OR private.lesson_reschedule_client_email(s) IS DISTINCT FROM a.email))
    THEN RAISE EXCEPTION 'reschedule_changed'; END IF;
  SELECT value INTO source_change FROM jsonb_array_elements(request.changes) WHERE (value->>'id')::uuid = request.session_id;
  shift := ((source_change->>'newStart')::timestamptz AT TIME ZONE 'Europe/Vilnius')
    - ((source_change->>'oldStart')::timestamptz AT TIME ZONE 'Europe/Vilnius');
  duration := (source_change->>'newEnd')::timestamptz - (source_change->>'newStart')::timestamptz;
  all_changes := request.changes;
  IF request.scope = 'future' THEN
    -- The rolling materializer may have extended the unchanged series while
    -- parents reviewed the proposal. Move those new occurrences as well.
    FOR live IN SELECT s.* FROM public.sessions s WHERE s.tutor_id = request.tutor_id AND s.status = 'active'
      AND s.start_time >= (source_change->>'oldStart')::timestamptz
      AND s.recurring_session_id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(request.recurrence_before))
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(all_changes) x WHERE (x->>'id')::uuid = s.id) FOR UPDATE LOOP
      IF NOT EXISTS(SELECT 1 FROM public.lesson_reschedule_recipients WHERE request_id = p_request AND live.student_id = ANY(student_ids))
        THEN RAISE EXCEPTION 'reschedule_changed'; END IF;
      all_changes := all_changes || jsonb_build_array(jsonb_build_object('id', live.id, 'studentId', live.student_id, 'subjectId', live.subject_id,
        'recurringId', live.recurring_session_id, 'oldStart', live.start_time, 'oldEnd', live.end_time,
        'newStart', private.lesson_reschedule_series_start(live.start_time, (source_change->>'oldStart')::timestamptz,
          (source_change->>'newStart')::timestamptz, (SELECT r.frequency FROM public.recurring_individual_sessions r WHERE r.id = live.recurring_session_id)),
        'newEnd', private.lesson_reschedule_series_start(live.start_time, (source_change->>'oldStart')::timestamptz,
          (source_change->>'newStart')::timestamptz, (SELECT r.frequency FROM public.recurring_individual_sessions r WHERE r.id = live.recurring_session_id)) + duration));
    END LOOP;
  END IF;
  PERFORM private.validate_lesson_reschedule_changes(request.tutor_id, all_changes);
  -- Leading occurrences move first to avoid transient conflicts with their own series.
  FOR c IN SELECT value FROM jsonb_array_elements(all_changes) ORDER BY
    CASE WHEN shift >= interval '0' THEN -(extract(epoch FROM (value->>'oldStart')::timestamptz))
      ELSE extract(epoch FROM (value->>'oldStart')::timestamptz) END LOOP
    UPDATE public.sessions s SET start_time = (c->>'newStart')::timestamptz, end_time = (c->>'newEnd')::timestamptz,
      original_start_time = COALESCE(s.original_start_time, s.start_time), rescheduled_at = now(),
      reschedule_reason = request.reason, reschedule_requested_by = request.requested_by,
      topic = CASE WHEN request.session_fields ? 'topic' THEN request.session_fields->>'topic' ELSE s.topic END,
      meeting_link = CASE WHEN request.session_fields ? 'meeting_link' THEN request.session_fields->>'meeting_link' ELSE s.meeting_link END,
      price = CASE WHEN request.session_fields ? 'price' THEN (request.session_fields->>'price')::numeric ELSE s.price END,
      tutor_comment = CASE WHEN request.session_fields ? 'tutor_comment' THEN request.session_fields->>'tutor_comment' ELSE s.tutor_comment END,
      show_comment_to_student = CASE WHEN request.session_fields ? 'show_comment_to_student' THEN (request.session_fields->>'show_comment_to_student')::boolean ELSE s.show_comment_to_student END,
      show_comment_to_parent = CASE WHEN request.session_fields ? 'show_comment_to_parent' THEN (request.session_fields->>'show_comment_to_parent')::boolean ELSE s.show_comment_to_parent END
      WHERE s.id = (c->>'id')::uuid;
  END LOOP;
  IF request.scope = 'future' THEN
    -- Cancellations and deletion tombstones follow the new schedule. Otherwise
    -- the next materializer run could recreate a previously removed lesson.
    UPDATE public.sessions s SET
      original_start_time = COALESCE(s.original_start_time, s.start_time),
      start_time = private.lesson_reschedule_series_start(s.start_time, (source_change->>'oldStart')::timestamptz,
        (source_change->>'newStart')::timestamptz, r.frequency),
      end_time = private.lesson_reschedule_series_start(s.start_time, (source_change->>'oldStart')::timestamptz,
        (source_change->>'newStart')::timestamptz, r.frequency) + duration
    FROM public.recurring_individual_sessions r
    WHERE s.recurring_session_id = r.id AND s.tutor_id = request.tutor_id AND s.status = 'cancelled'
      AND s.start_time >= (source_change->>'oldStart')::timestamptz
      AND r.id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(request.recurrence_before));
    FOR exclusion IN SELECT e.id, e.start_time, r.frequency FROM public.session_recurrence_exclusions e
      JOIN public.recurring_individual_sessions r ON r.id = e.recurring_session_id
      WHERE e.start_time >= (source_change->>'oldStart')::timestamptz
        AND r.id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(request.recurrence_before))
      ORDER BY CASE WHEN shift >= interval '0' THEN -extract(epoch FROM e.start_time)
        ELSE extract(epoch FROM e.start_time) END LOOP
      UPDATE public.session_recurrence_exclusions SET
        start_time = private.lesson_reschedule_series_start(exclusion.start_time, (source_change->>'oldStart')::timestamptz,
          (source_change->>'newStart')::timestamptz, exclusion.frequency) WHERE id = exclusion.id;
    END LOOP;
    UPDATE public.recurring_individual_sessions r SET
      start_date = (source_change->>'newStart')::timestamptz AT TIME ZONE 'Europe/Vilnius',
      end_date = CASE WHEN r.end_date IS NULL THEN NULL ELSE GREATEST(r.end_date +
        (((source_change->>'newStart')::timestamptz AT TIME ZONE 'Europe/Vilnius')::date -
         ((source_change->>'oldStart')::timestamptz AT TIME ZONE 'Europe/Vilnius')::date),
        (SELECT max(((value->>'newStart')::timestamptz AT TIME ZONE 'Europe/Vilnius')::date)
          FROM jsonb_array_elements(all_changes) WHERE (value->>'recurringId')::uuid = r.id)) END,
      day_of_week = extract(dow FROM (source_change->>'newStart')::timestamptz AT TIME ZONE 'Europe/Vilnius'),
      start_time = ((source_change->>'newStart')::timestamptz AT TIME ZONE 'Europe/Vilnius')::time,
      end_time = ((source_change->>'newEnd')::timestamptz AT TIME ZONE 'Europe/Vilnius')::time,
      last_materialized_at = NULL,
      topic = CASE WHEN request.session_fields ? 'topic' THEN request.session_fields->>'topic' ELSE r.topic END,
      meeting_link = CASE WHEN request.session_fields ? 'meeting_link' THEN request.session_fields->>'meeting_link' ELSE r.meeting_link END,
      price = CASE WHEN request.session_fields ? 'price' THEN (request.session_fields->>'price')::numeric ELSE r.price END
      WHERE r.id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(request.recurrence_before));
  END IF;
  UPDATE public.lesson_reschedule_requests SET status = 'approved', resolved_at = now(), changes = all_changes WHERE id = p_request;
  RETURN jsonb_build_object('status', 'approved', 'changed', true);
END;
$$;

REVOKE ALL ON FUNCTION private.lesson_reschedule_snapshot(public.sessions),
  private.lesson_reschedule_recurrence_snapshot(public.recurring_individual_sessions),
  private.lesson_reschedule_client_email(public.students), private.validate_lesson_reschedule_changes(uuid, jsonb),
  private.lesson_reschedule_series_start(timestamptz, timestamptz, timestamptz, text),
  public.create_lesson_reschedule_request(uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, jsonb, boolean),
  public.respond_lesson_reschedule_request(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.lesson_reschedule_snapshot(public.sessions),
  private.lesson_reschedule_recurrence_snapshot(public.recurring_individual_sessions),
  private.lesson_reschedule_client_email(public.students), private.validate_lesson_reschedule_changes(uuid, jsonb),
  private.lesson_reschedule_series_start(timestamptz, timestamptz, timestamptz, text),
  public.create_lesson_reschedule_request(uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, jsonb, boolean),
  public.respond_lesson_reschedule_request(uuid, text, text) TO service_role;

-- Protect old open tabs and direct Data API updates as well as the new UI.
CREATE FUNCTION private.guard_tutor_recurring_reschedule_approval() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); org_id uuid;
BEGIN
  IF actor IS NULL OR actor <> OLD.tutor_id THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'sessions' THEN
    IF OLD.recurring_session_id IS NULL OR NEW.start_time IS NOT DISTINCT FROM OLD.start_time
      THEN RETURN NEW; END IF;
  ELSE
    IF (NEW.start_time, NEW.day_of_week, NEW.start_date, NEW.frequency)
      IS NOT DISTINCT FROM (OLD.start_time, OLD.day_of_week, OLD.start_date, OLD.frequency)
      THEN RETURN NEW; END IF;
  END IF;
  SELECT organization_id INTO org_id FROM public.profiles WHERE id = OLD.tutor_id;
  IF EXISTS(SELECT 1 FROM public.organizations WHERE id = org_id AND entity_type = 'company'
      AND features->>'tutor_recurring_reschedule_approval' = 'true')
    AND NOT EXISTS(SELECT 1 FROM public.organization_admins a WHERE a.organization_id = org_id
      AND a.user_id = actor AND a.status = 'active' AND a.accepted_at IS NOT NULL
      AND (a.role = 'owner' OR a.permissions->>'sessions.edit' = 'true')) THEN
    RAISE EXCEPTION 'reschedule_approval_required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_tutor_recurring_reschedule_approval() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_tutor_recurring_reschedule_approval BEFORE UPDATE OF start_time, end_time ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION private.guard_tutor_recurring_reschedule_approval();
CREATE TRIGGER guard_tutor_recurring_schedule_approval BEFORE UPDATE OF start_time, end_time, day_of_week, start_date, frequency
  ON public.recurring_individual_sessions FOR EACH ROW EXECUTE FUNCTION private.guard_tutor_recurring_reschedule_approval();

UPDATE public.organizations SET features = COALESCE(features, '{}') || '{"tutor_recurring_reschedule_approval":true}'::jsonb
WHERE id IN ('c1f36796-c281-4650-bed2-1bd6874764f1', 'c1b00000-7e57-4000-8000-000000000001');
