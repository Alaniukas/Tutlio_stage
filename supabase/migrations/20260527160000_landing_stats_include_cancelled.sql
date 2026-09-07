-- Include cancelled sessions in public landing stats (completed + upcoming buckets).

CREATE OR REPLACE FUNCTION public.get_public_landing_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cache landing_stats_cache%ROWTYPE;
BEGIN
  SELECT * INTO v_cache FROM landing_stats_cache WHERE id = 1;

  IF v_cache.refreshed_at > now() - interval '30 minutes' THEN
    RETURN jsonb_build_object(
      'completed_lessons', v_cache.completed_lessons,
      'upcoming_lessons',  v_cache.upcoming_lessons,
      'total_tutors',      v_cache.total_tutors,
      'total_students',    v_cache.total_students
    );
  END IF;

  UPDATE landing_stats_cache SET
    completed_lessons = (
      SELECT count(*) FROM sessions
      WHERE status IN ('completed', 'no_show')
         OR (status = 'active' AND end_time < now())
         OR (status = 'cancelled' AND start_time <= now())
    ),
    upcoming_lessons = (
      SELECT count(*) FROM sessions
      WHERE (status = 'active' AND start_time > now())
         OR (status = 'cancelled' AND start_time > now())
    ),
    total_tutors  = (SELECT count(*) FROM profiles),
    total_students = (SELECT count(*) FROM students),
    refreshed_at  = now()
  WHERE id = 1;

  SELECT * INTO v_cache FROM landing_stats_cache WHERE id = 1;

  RETURN jsonb_build_object(
    'completed_lessons', v_cache.completed_lessons,
    'upcoming_lessons',  v_cache.upcoming_lessons,
    'total_tutors',      v_cache.total_tutors,
    'total_students',    v_cache.total_students
  );
END;
$$;

-- Force cache refresh on next landing page visit.
UPDATE public.landing_stats_cache SET refreshed_at = '1970-01-01' WHERE id = 1;
