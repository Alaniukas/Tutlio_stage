-- Let a linked parent reschedule their child's lesson (same as student_reschedule_session for the child).

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
BEGIN
  IF public.write_blocked_by_org_suspension() THEN
    RETURN json_build_object('success', false, 'error', 'organization_suspended');
  END IF;

  SELECT student_id INTO v_session_student_id
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
