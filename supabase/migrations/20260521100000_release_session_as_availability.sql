-- When a lesson is cancelled/rescheduled (student side), free the original slot as one-time availability.

CREATE OR REPLACE FUNCTION public.release_cancelled_session_as_availability(
  p_tutor_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_subject_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_specific_date date;
  v_start_time time;
  v_end_time time;
  v_is_group boolean;
BEGIN
  IF p_end_time <= now() THEN
    RETURN false;
  END IF;

  IF p_subject_id IS NOT NULL THEN
    SELECT COALESCE(is_group, false) INTO v_is_group
    FROM subjects WHERE id = p_subject_id;
    IF v_is_group THEN
      RETURN false;
    END IF;
  END IF;

  v_specific_date := (p_start_time AT TIME ZONE 'Europe/Vilnius')::date;
  v_start_time := (p_start_time AT TIME ZONE 'Europe/Vilnius')::time;
  v_end_time := (p_end_time AT TIME ZONE 'Europe/Vilnius')::time;

  IF v_start_time >= v_end_time THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM availability a
    WHERE a.tutor_id = p_tutor_id
      AND a.is_recurring = false
      AND a.specific_date = v_specific_date
      AND a.start_time < v_end_time
      AND a.end_time > v_start_time
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO availability (
    tutor_id,
    specific_date,
    start_time,
    end_time,
    is_recurring,
    subject_ids
  ) VALUES (
    p_tutor_id,
    v_specific_date,
    v_start_time,
    v_end_time,
    false,
    CASE WHEN p_subject_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[p_subject_id] END
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.student_reschedule_session(
  p_session_id uuid,
  p_new_start_time timestamptz,
  p_new_end_time timestamptz
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_student_id uuid;
  v_tutor_id uuid;
  v_old_start timestamptz;
  v_old_end timestamptz;
  v_subject_id uuid;
BEGIN
  IF public.write_blocked_by_org_suspension() THEN
    RETURN json_build_object('success', false, 'error', 'organization_suspended');
  END IF;

  SELECT student_id, tutor_id, start_time, end_time, subject_id
  INTO v_session_student_id, v_tutor_id, v_old_start, v_old_end, v_subject_id
  FROM sessions
  WHERE id = p_session_id;

  IF v_session_student_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Session not found');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = v_session_student_id AND s.linked_user_id = auth.uid()
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.parent_students ps
    JOIN public.parent_profiles pp ON pp.id = ps.parent_id
    WHERE pp.user_id = auth.uid()
      AND ps.student_id = v_session_student_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized to reschedule this session');
  END IF;

  IF v_old_start IS DISTINCT FROM p_new_start_time THEN
    PERFORM public.release_cancelled_session_as_availability(
      v_tutor_id,
      v_old_start,
      v_old_end,
      v_subject_id
    );
  END IF;

  UPDATE sessions
  SET
    start_time = p_new_start_time,
    end_time = p_new_end_time,
    reminder_student_sent = false,
    reminder_tutor_sent = false,
    reminder_payer_sent = false
  WHERE id = p_session_id;

  RETURN json_build_object('success', true);
END;
$$;
