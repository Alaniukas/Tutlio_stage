-- Harden the sessions_student_update RLS surface.
--
-- The policy lets a student/parent UPDATE their own session rows with no column
-- restriction, so a crafted PostgREST request could move a lesson (start_time),
-- flip status/paid, etc., bypassing the product rules (reschedule RPC guards,
-- cancel API penalties, disable_student_reschedule_cancel).
--
-- RLS cannot restrict columns, so a BEFORE UPDATE trigger enforces a column
-- whitelist when the actor is the session's student or a linked parent:
--   * student_joined_at  (join-click tracking, src/lib/joinTracking.ts)
--   * available_spots    (group booking spot decrement, StudentSchedule)
-- Everything else must go through the RPC / API endpoints. The legitimate
-- student_reschedule_session RPC raises a transaction-local flag the trigger
-- honours (SECURITY DEFINER bypasses RLS but NOT triggers).
--
-- Tutors, org admins, service-role API calls (auth.uid() IS NULL) and the
-- student RPC are unaffected.

CREATE OR REPLACE FUNCTION public.sessions_student_column_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_student_actor boolean;
BEGIN
  -- Service role / direct SQL / cron: no user JWT.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Legitimate student write path (student_reschedule_session RPC).
  IF current_setting('app.allow_student_session_write', true) = '1' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
           SELECT 1 FROM public.students s
           WHERE s.id = NEW.student_id AND s.linked_user_id = v_uid
         )
      OR EXISTS (
           SELECT 1
           FROM public.parent_students ps
           JOIN public.parent_profiles pp ON pp.id = ps.parent_id
           WHERE pp.user_id = v_uid AND ps.student_id = NEW.student_id
         )
    INTO v_is_student_actor;

  -- Tutor / org admin / platform admin: other policies already scope them.
  IF NOT v_is_student_actor THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'student_joined_at' - 'available_spots')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'student_joined_at' - 'available_spots') THEN
    RAISE EXCEPTION 'students_may_only_update_join_tracking_and_spots'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sessions_student_column_guard ON public.sessions;
CREATE TRIGGER sessions_student_column_guard
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.sessions_student_column_guard();

-- student_reschedule_session: same as 20260703120100 plus the trigger
-- pass-through flag (transaction-local, resets automatically).
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

  -- Org feature: students/parents may be blocked from rescheduling entirely.
  IF v_org_id IS NOT NULL
     AND public.org_has_feature(v_org_id, 'disable_student_reschedule_cancel') THEN
    RETURN json_build_object('success', false, 'error', 'student_actions_disabled');
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

  -- Allow this UPDATE through the sessions_student_column_guard trigger.
  PERFORM set_config('app.allow_student_session_write', '1', true);

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
