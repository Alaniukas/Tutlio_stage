-- Tutor calendar bulk edits must survive the rolling materializer. Preserve
-- completed history and validate the entire destination before the first write.
-- The API supplies the verified tutor identity. The RPC is service-role-only;
-- deletion exclusions remain server-only. It checks live ownership and org rules.
CREATE FUNCTION public.edit_tutor_calendar_series(
  p_tutor uuid, p_session uuid, p_recurrence_ids uuid[],
  p_expected_start timestamptz, p_expected_end timestamptz,
  p_start timestamptz, p_end timestamptz,
  p_fields jsonb DEFAULT '{}', p_reason text DEFAULT '', p_requested_by text DEFAULT 'tutor'
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  tutor uuid := p_tutor; source public.sessions; recurrence_ids uuid[]; org public.organizations;
  changes jsonb; c jsonb; exclusion record; affected integer;
  timing_changed boolean; start_changed boolean; duration interval; day_shift integer;
BEGIN
  IF tutor IS NULL THEN RAISE EXCEPTION 'reschedule_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('lesson-reschedule:' || tutor::text, 0));
  SELECT * INTO source FROM public.sessions WHERE id = p_session AND tutor_id = tutor FOR UPDATE;
  IF source.id IS NULL OR source.status <> 'active' OR source.recurring_session_id IS NULL
    OR source.class_group_id IS NOT NULL THEN RAISE EXCEPTION 'reschedule_unavailable'; END IF;
  IF source.start_time IS DISTINCT FROM p_expected_start OR source.end_time IS DISTINCT FROM p_expected_end
    THEN RAISE EXCEPTION 'reschedule_changed'; END IF;
  IF source.start_time <= now() THEN RAISE EXCEPTION 'reschedule_expired'; END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start OR p_start <= now()
    OR ((p_end AT TIME ZONE 'Europe/Vilnius')::time <= (p_start AT TIME ZONE 'Europe/Vilnius')::time)
    OR p_fields IS NULL OR jsonb_typeof(p_fields) <> 'object' OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_fields) k WHERE k NOT IN
        ('topic', 'meeting_link', 'price', 'tutor_comment', 'show_comment_to_student', 'show_comment_to_parent')
    ) THEN RAISE EXCEPTION 'reschedule_invalid'; END IF;
  timing_changed := (p_start, p_end) IS DISTINCT FROM (source.start_time, source.end_time);
  start_changed := p_start IS DISTINCT FROM source.start_time;
  SELECT o.* INTO org FROM public.profiles p JOIN public.students s ON s.id = source.student_id
    JOIN public.organizations o ON o.id = COALESCE(p.organization_id, s.organization_id) WHERE p.id = tutor;
  IF org.status = 'suspended' THEN RAISE EXCEPTION 'reschedule_unavailable'; END IF;
  IF ((timing_changed AND org.features->>'org_admin_only_reschedule' = 'true')
    OR (start_changed AND org.entity_type = 'company' AND org.features->>'tutor_recurring_reschedule_approval' = 'true'))
    AND NOT EXISTS (SELECT 1 FROM public.organization_admins a WHERE a.organization_id = org.id
      AND a.user_id = tutor AND a.status = 'active' AND a.accepted_at IS NOT NULL
      AND (a.role = 'owner' OR a.permissions->>'sessions.edit' = 'true'))
    THEN RAISE EXCEPTION 'reschedule_approval_required'; END IF;
  IF start_changed AND (p_reason IS NULL OR length(trim(p_reason)) < 5
    OR p_requested_by IS NULL OR p_requested_by NOT IN ('student', 'tutor'))
    THEN RAISE EXCEPTION 'reschedule_invalid'; END IF;
  duration := p_end - p_start;
  day_shift := (p_start AT TIME ZONE 'Europe/Vilnius')::date - (source.start_time AT TIME ZONE 'Europe/Vilnius')::date;

  SELECT array_agg(DISTINCT requested.id) INTO recurrence_ids FROM unnest(p_recurrence_ids) requested(id);
  IF recurrence_ids IS NULL OR NOT (source.recurring_session_id = ANY(recurrence_ids)) OR EXISTS (
    SELECT 1 FROM unnest(recurrence_ids) requested(id) WHERE requested.id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.sessions s JOIN public.recurring_individual_sessions r ON r.id = s.recurring_session_id
      WHERE r.id = requested.id AND r.tutor_id = tutor AND r.active AND s.tutor_id = tutor
        AND s.status IN ('active', 'cancelled') AND s.subject_id IS NOT DISTINCT FROM source.subject_id
        AND s.start_time = source.start_time AND s.end_time = source.end_time
    )
  ) THEN RAISE EXCEPTION 'reschedule_unavailable'; END IF;
  PERFORM 1 FROM public.recurring_individual_sessions r WHERE r.id = ANY(recurrence_ids) ORDER BY r.id FOR UPDATE;
  PERFORM 1 FROM public.sessions s WHERE s.tutor_id = tutor AND s.recurring_session_id = ANY(recurrence_ids)
    AND s.start_time > now() AND s.status IN ('active', 'cancelled') ORDER BY s.id FOR UPDATE;
  -- A clock/duration edit from a clamped February occurrence must retain the
  -- original month-end dates and anchor. Re-anchor monthly dates only on a date edit.
  SELECT jsonb_agg(jsonb_build_object('id', s.id, 'recurringId', s.recurring_session_id, 'status', s.status, 'oldStart', s.start_time, 'oldEnd', s.end_time,
    'newStart', CASE WHEN timing_changed THEN private.lesson_reschedule_series_start(
      s.start_time, source.start_time, p_start, CASE WHEN r.frequency = 'monthly' AND day_shift = 0
        THEN 'weekly' ELSE r.frequency END) ELSE s.start_time END,
    'newEnd', CASE WHEN timing_changed THEN private.lesson_reschedule_series_start(
      s.start_time, source.start_time, p_start, CASE WHEN r.frequency = 'monthly' AND day_shift = 0
        THEN 'weekly' ELSE r.frequency END) + duration ELSE s.end_time END))
    INTO changes FROM public.sessions s JOIN public.recurring_individual_sessions r ON r.id = s.recurring_session_id
    WHERE s.tutor_id = tutor AND r.tutor_id = tutor AND s.recurring_session_id = ANY(recurrence_ids)
      AND s.start_time > now() AND (s.status = 'active' OR (timing_changed AND s.status = 'cancelled'));
  IF changes IS NULL THEN RAISE EXCEPTION 'reschedule_changed'; END IF;

  IF timing_changed THEN
    FOR c IN SELECT value FROM jsonb_array_elements(changes) WHERE value->>'status' = 'active' LOOP
      IF (c->>'newStart')::timestamptz <= now() OR (c->>'newEnd')::timestamptz <= (c->>'newStart')::timestamptz
        THEN RAISE EXCEPTION 'reschedule_expired'; END IF;
      IF EXISTS (
        SELECT 1 FROM public.sessions s WHERE s.tutor_id = tutor AND s.status <> 'cancelled'
          AND s.start_time < (c->>'newEnd')::timestamptz AND s.end_time > (c->>'newStart')::timestamptz
          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(changes) x WHERE (x->>'id')::uuid = s.id)
      ) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(changes) x WHERE x->>'status' = 'active' AND x->>'id' <> c->>'id'
          AND (x->>'newStart')::timestamptz < (c->>'newEnd')::timestamptz
          AND (x->>'newEnd')::timestamptz > (c->>'newStart')::timestamptz
          AND (x->>'oldStart', x->>'oldEnd') IS DISTINCT FROM (c->>'oldStart', c->>'oldEnd')
      ) THEN RAISE EXCEPTION 'reschedule_conflict'; END IF;
    END LOOP;
  END IF;

  -- Move the leading edge first to avoid transient student/start uniqueness violations.
  FOR c IN SELECT value FROM jsonb_array_elements(changes) ORDER BY CASE WHEN day_shift >= 0
    AND p_start >= source.start_time THEN -extract(epoch FROM (value->>'oldStart')::timestamptz)
    ELSE extract(epoch FROM (value->>'oldStart')::timestamptz) END LOOP
    UPDATE public.sessions s SET start_time = (c->>'newStart')::timestamptz, end_time = (c->>'newEnd')::timestamptz,
      original_start_time = CASE WHEN timing_changed THEN COALESCE(s.original_start_time, s.start_time) ELSE s.original_start_time END,
      rescheduled_at = CASE WHEN start_changed AND s.status = 'active' THEN now() ELSE s.rescheduled_at END,
      reschedule_reason = CASE WHEN start_changed AND s.status = 'active' THEN trim(p_reason) ELSE s.reschedule_reason END,
      reschedule_requested_by = CASE WHEN start_changed AND s.status = 'active' THEN p_requested_by ELSE s.reschedule_requested_by END,
      topic = CASE WHEN s.status = 'active' AND p_fields ? 'topic' THEN p_fields->>'topic' ELSE s.topic END,
      meeting_link = CASE WHEN s.status = 'active' AND p_fields ? 'meeting_link' THEN p_fields->>'meeting_link' ELSE s.meeting_link END,
      price = CASE WHEN s.status = 'active' AND p_fields ? 'price' THEN (p_fields->>'price')::numeric ELSE s.price END,
      tutor_comment = CASE WHEN s.status = 'active' AND p_fields ? 'tutor_comment' THEN p_fields->>'tutor_comment' ELSE s.tutor_comment END,
      show_comment_to_student = CASE WHEN s.status = 'active' AND p_fields ? 'show_comment_to_student'
        THEN (p_fields->>'show_comment_to_student')::boolean ELSE s.show_comment_to_student END,
      show_comment_to_parent = CASE WHEN s.status = 'active' AND p_fields ? 'show_comment_to_parent'
        THEN (p_fields->>'show_comment_to_parent')::boolean ELSE s.show_comment_to_parent END
      WHERE s.id = (c->>'id')::uuid AND s.tutor_id = tutor;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'reschedule_unavailable'; END IF;
  END LOOP;
  IF timing_changed THEN
    FOR exclusion IN SELECT e.id, e.start_time, r.frequency FROM public.session_recurrence_exclusions e
      JOIN public.recurring_individual_sessions r ON r.id = e.recurring_session_id
      WHERE r.id = ANY(recurrence_ids) AND r.tutor_id = tutor AND e.start_time > now()
      ORDER BY CASE WHEN p_start >= source.start_time THEN -extract(epoch FROM e.start_time)
        ELSE extract(epoch FROM e.start_time) END LOOP
      UPDATE public.session_recurrence_exclusions SET start_time = private.lesson_reschedule_series_start(
        exclusion.start_time, source.start_time, p_start, CASE WHEN exclusion.frequency = 'monthly' AND day_shift = 0
          THEN 'weekly' ELSE exclusion.frequency END) WHERE id = exclusion.id;
      GET DIAGNOSTICS affected = ROW_COUNT;
      IF affected <> 1 THEN RAISE EXCEPTION 'reschedule_unavailable'; END IF;
    END LOOP;
  END IF;
  UPDATE public.recurring_individual_sessions r SET
    start_date = CASE WHEN timing_changed AND day_shift <> 0 THEN (
      SELECT min(((value->>'newStart')::timestamptz AT TIME ZONE 'Europe/Vilnius')::date)
      FROM jsonb_array_elements(changes) WHERE (value->>'recurringId')::uuid = r.id
    ) ELSE r.start_date END,
    day_of_week = CASE WHEN timing_changed AND day_shift <> 0 THEN extract(dow FROM p_start AT TIME ZONE 'Europe/Vilnius') ELSE r.day_of_week END,
    start_time = CASE WHEN timing_changed THEN (p_start AT TIME ZONE 'Europe/Vilnius')::time ELSE r.start_time END,
    end_time = CASE WHEN timing_changed THEN (p_end AT TIME ZONE 'Europe/Vilnius')::time ELSE r.end_time END,
    end_date = CASE WHEN timing_changed AND r.end_date IS NOT NULL THEN GREATEST(r.end_date + day_shift,
      (SELECT max(((value->>'newStart')::timestamptz AT TIME ZONE 'Europe/Vilnius')::date)
        FROM jsonb_array_elements(changes) WHERE (value->>'recurringId')::uuid = r.id)) ELSE r.end_date END,
    topic = CASE WHEN p_fields ? 'topic' THEN p_fields->>'topic' ELSE r.topic END,
    meeting_link = CASE WHEN p_fields ? 'meeting_link' THEN p_fields->>'meeting_link' ELSE r.meeting_link END,
    price = CASE WHEN p_fields ? 'price' THEN (p_fields->>'price')::numeric ELSE r.price END,
    last_materialized_at = NULL
    WHERE r.id = ANY(recurrence_ids) AND r.tutor_id = tutor;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> cardinality(recurrence_ids) THEN RAISE EXCEPTION 'reschedule_unavailable'; END IF;
  RETURN (SELECT jsonb_agg(jsonb_build_object('id', value->>'id', 'start_time', value->>'newStart', 'end_time', value->>'newEnd'))
    FROM jsonb_array_elements(changes) WHERE value->>'status' = 'active');
END;
$$;

REVOKE ALL ON FUNCTION public.edit_tutor_calendar_series(uuid, uuid, uuid[], timestamptz, timestamptz,
  timestamptz, timestamptz, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_tutor_calendar_series(uuid, uuid, uuid[], timestamptz, timestamptz,
  timestamptz, timestamptz, jsonb, text, text) TO service_role;
