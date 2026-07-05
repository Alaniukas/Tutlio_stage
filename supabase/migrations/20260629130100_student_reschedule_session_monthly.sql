-- Same-calendar-month reschedule guard for monthly packages (Phase 2, req 6).
--
-- Extends student_reschedule_session (student/parent path) so that, when the
-- org has the `monthly_packages` feature on AND the lesson belongs to a package
-- (lesson_package_id set), it can only be moved within the same calendar month
-- as its package month (anchored on the original start so repeated moves can't
-- drift across months). One-off / trial lessons (no package) are unconstrained.
-- The move is always recorded:
--   * original_start_time -> set once, on the first move
--   * rescheduled_at       -> updated on every move
--
-- Month comparison uses the database timezone (UTC); the client guards compare
-- in the user's local timezone. Boundary disagreements are rare and the RPC is
-- a safety net behind the UI guard.
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
  v_current_start timestamptz;
  v_original_start timestamptz;
  v_lesson_package_id uuid;
  v_org_id uuid;
  v_anchor timestamptz;
BEGIN
  IF public.write_blocked_by_org_suspension() THEN
    RETURN json_build_object('success', false, 'error', 'organization_suspended');
  END IF;

  SELECT se.student_id, se.start_time, se.original_start_time, se.lesson_package_id, p.organization_id
    INTO v_session_student_id, v_current_start, v_original_start, v_lesson_package_id, v_org_id
  FROM sessions se
  LEFT JOIN profiles p ON p.id = se.tutor_id
  WHERE se.id = p_session_id;

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

  -- Same-calendar-month guard (monthly packages, package lessons only).
  IF v_lesson_package_id IS NOT NULL
     AND v_org_id IS NOT NULL
     AND public.org_has_feature(v_org_id, 'monthly_packages') THEN
    v_anchor := COALESCE(v_original_start, v_current_start);
    IF date_trunc('month', p_new_start_time) <> date_trunc('month', v_anchor) THEN
      RETURN json_build_object('success', false, 'error', 'different_month');
    END IF;
  END IF;

  UPDATE sessions
  SET
    start_time = p_new_start_time,
    end_time = p_new_end_time,
    original_start_time = COALESCE(original_start_time, start_time),
    rescheduled_at = now(),
    reminder_student_sent = false,
    reminder_tutor_sent = false,
    reminder_payer_sent = false
  WHERE id = p_session_id;

  RETURN json_build_object('success', true);
END;
$$;
