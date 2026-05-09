-- Public landing page stats: aggregate counts from sessions, profiles, students.
-- SECURITY DEFINER so anon callers bypass RLS and only receive aggregates.

CREATE OR REPLACE FUNCTION public.get_public_landing_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_completed  bigint;
  v_upcoming   bigint;
  v_tutors     bigint;
  v_students   bigint;
BEGIN
  -- Completed lessons: status completed OR active but end_time already passed
  SELECT count(*) INTO v_completed
  FROM sessions
  WHERE status IN ('completed', 'no_show')
     OR (status = 'active' AND end_time < now());

  -- Upcoming scheduled lessons: active and start_time in the future
  SELECT count(*) INTO v_upcoming
  FROM sessions
  WHERE status = 'active'
    AND start_time > now();

  -- Active tutors (profiles table)
  SELECT count(*) INTO v_tutors
  FROM profiles;

  -- Students
  SELECT count(*) INTO v_students
  FROM students;

  RETURN jsonb_build_object(
    'completed_lessons', v_completed,
    'upcoming_lessons',  v_upcoming,
    'total_tutors',      v_tutors,
    'total_students',    v_students
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_landing_stats() TO anon, authenticated;
