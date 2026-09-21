-- Tutor-facing trial-comment hints must use the same organization-wide trial
-- order as the service-role penalty job. Ordinary session RLS only shows a
-- tutor's own lessons, so expose the minimum history needed for that order.
CREATE OR REPLACE FUNCTION public.proklase_tutor_trial_history(p_student_ids uuid[])
RETURNS TABLE(id uuid, student_id uuid, start_time timestamptz, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT lesson.id, lesson.student_id, lesson.start_time, lesson.status::text
  FROM public.sessions lesson
  JOIN public.subjects subject ON subject.id = lesson.subject_id
  JOIN public.profiles lesson_tutor ON lesson_tutor.id = lesson.tutor_id
  JOIN public.profiles caller ON caller.id = auth.uid()
  WHERE caller.organization_id IN (
    '3422031d-6e21-424d-980b-35a9c6d7b8f1', -- Pro Klasė
    'b0a00000-7e57-4000-8000-000000000001'  -- QA demo
  )
    AND lesson_tutor.organization_id = caller.organization_id
    AND lesson.student_id = ANY(p_student_ids)
    AND subject.is_trial = true
    AND EXISTS (
      SELECT 1 FROM public.sessions own_lesson
      WHERE own_lesson.student_id = lesson.student_id
        AND own_lesson.tutor_id = caller.id
        AND own_lesson.status <> 'cancelled'
    )
  ORDER BY lesson.start_time, lesson.id;
$$;

REVOKE ALL ON FUNCTION public.proklase_tutor_trial_history(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proklase_tutor_trial_history(uuid[]) TO authenticated;
