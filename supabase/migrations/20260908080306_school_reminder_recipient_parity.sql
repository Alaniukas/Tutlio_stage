-- Keep the due queue aligned with send-reminders recipient fallback.
CREATE OR REPLACE FUNCTION public.get_due_session_reminder_ids(p_limit integer DEFAULT 250)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT lesson_session.id
  FROM public.sessions lesson_session
  JOIN public.profiles tutor ON tutor.id = lesson_session.tutor_id
  JOIN public.students student ON student.id = lesson_session.student_id
  LEFT JOIN public.organizations organization ON organization.id = COALESCE(student.organization_id, tutor.organization_id)
  WHERE lesson_session.status = 'active'
    AND lesson_session.start_time > now()
    AND lesson_session.start_time < now() + interval '72 hours'
    AND (
      (
        lesson_session.reminder_student_sent IS NOT TRUE
        AND COALESCE(tutor.reminder_student_hours, 2) > 0
        AND lesson_session.start_time <= now() + COALESCE(tutor.reminder_student_hours, 2) * interval '1 hour'
        AND NULLIF(btrim(student.email), '') IS NOT NULL
      )
      OR (
        lesson_session.reminder_tutor_sent IS NOT TRUE
        AND COALESCE(tutor.reminder_tutor_hours, 2) > 0
        AND lesson_session.start_time <= now() + COALESCE(tutor.reminder_tutor_hours, 2) * interval '1 hour'
        AND NULLIF(btrim(tutor.email), '') IS NOT NULL
      )
      OR (
        lesson_session.reminder_payer_sent IS NOT TRUE
        AND COALESCE(tutor.reminder_student_hours, 2) > 0
        AND lesson_session.start_time <= now() + COALESCE(tutor.reminder_student_hours, 2) * interval '1 hour'
        AND (
          (
            (student.payment_payer = 'parent' OR NULLIF(btrim(student.email), '') IS NULL)
            AND NULLIF(btrim(student.payer_email), '') IS NOT NULL
            AND (organization.entity_type IS DISTINCT FROM 'school' OR NULLIF(btrim(student.email), '') IS NULL)
          )
          OR (
            organization.entity_type = 'school'
            AND NULLIF(btrim(student.email), '') IS NULL
            AND NULLIF(btrim(student.parent_secondary_email), '') IS NOT NULL
          )
          OR (
            COALESCE(organization.features, '{}'::jsonb) @> '{"flexible_invitations": true}'::jsonb
            AND (
              NULLIF(btrim(student.payer_email), '') IS NOT NULL
              OR NULLIF(btrim(student.parent_secondary_email), '') IS NOT NULL
              OR EXISTS (
                SELECT 1
                FROM public.parent_students parent_link
                JOIN public.parent_profiles parent
                  ON parent.id = parent_link.parent_id
                WHERE parent_link.student_id = student.id
                  AND parent.disable_lesson_reminders IS NOT TRUE
                  AND NULLIF(btrim(parent.email), '') IS NOT NULL
              )
            )
          )
        )
      )
    )
  ORDER BY lesson_session.start_time, lesson_session.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 250), 1), 1000);
$$;

REVOKE ALL ON FUNCTION public.get_due_session_reminder_ids(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_session_reminder_ids(integer)
  TO service_role;
