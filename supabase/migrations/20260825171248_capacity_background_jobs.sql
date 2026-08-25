-- Give the rolling materializer a persistent fair-work cursor. With an hourly
-- bounded batch, 1,000 templates are refreshed within ten hours while the
-- calendar keeps a sixty-day materialized horizon.
ALTER TABLE public.recurring_individual_sessions
  ADD COLUMN IF NOT EXISTS last_materialized_at timestamptz;

COMMENT ON COLUMN public.recurring_individual_sessions.last_materialized_at IS
  'Last time the rolling recurring-session materializer processed this template.';

CREATE INDEX IF NOT EXISTS idx_recurring_individual_sessions_materializer
  ON public.recurring_individual_sessions (last_materialized_at ASC NULLS FIRST, id)
  WHERE active = true AND end_date IS NULL;

-- Cover the high-frequency reminder/materializer scans and the missing foreign
-- key indexes reported by the production performance advisor.
CREATE INDEX IF NOT EXISTS idx_sessions_recurring_start
  ON public.sessions (recurring_session_id, start_time)
  WHERE recurring_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_reminder_pending_start
  ON public.sessions (start_time, id)
  WHERE status = 'active'
    AND (
      reminder_student_sent IS NOT TRUE
      OR reminder_tutor_sent IS NOT TRUE
      OR reminder_payer_sent IS NOT TRUE
    );

CREATE INDEX IF NOT EXISTS idx_school_installments_reminder_pending
  ON public.school_payment_installments (due_date, id)
  WHERE payment_status = 'pending'
    AND (reminder_3d_sent_at IS NULL OR reminder_1d_sent_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_subjects_tutor_id
  ON public.subjects (tutor_id);

CREATE INDEX IF NOT EXISTS idx_availability_tutor_id
  ON public.availability (tutor_id);

CREATE INDEX IF NOT EXISTS idx_organization_admins_organization_id
  ON public.organization_admins (organization_id);

CREATE INDEX IF NOT EXISTS idx_sessions_subject_id
  ON public.sessions (subject_id);

CREATE INDEX IF NOT EXISTS idx_students_parent_user_id
  ON public.students (parent_user_id)
  WHERE parent_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_individual_sessions_tutor_id
  ON public.recurring_individual_sessions (tutor_id);

CREATE INDEX IF NOT EXISTS idx_recurring_individual_sessions_subject_id
  ON public.recurring_individual_sessions (subject_id)
  WHERE subject_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_waitlists_tutor_id
  ON public.waitlists (tutor_id);

CREATE INDEX IF NOT EXISTS idx_waitlists_session_id
  ON public.waitlists (session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_student_id
  ON public.payments (student_id);

CREATE INDEX IF NOT EXISTS idx_payments_session_id
  ON public.payments (session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_monthly_plans_organization_id
  ON public.recurring_monthly_package_plans (organization_id);

CREATE INDEX IF NOT EXISTS idx_recurring_monthly_plans_student_id
  ON public.recurring_monthly_package_plans (student_id);

CREATE INDEX IF NOT EXISTS idx_recurring_monthly_plans_subject_id
  ON public.recurring_monthly_package_plans (subject_id)
  WHERE subject_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tutor_adjustments_tutor_id
  ON public.tutor_adjustments (tutor_id);

-- Return only reminder rows that are due and have an actionable recipient.
-- The service-role cron then performs the external email side effect and marks
-- each recipient flag only after a successful response.
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
  LEFT JOIN public.organizations organization ON organization.id = tutor.organization_id
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
            student.payment_payer = 'parent'
            AND NULLIF(btrim(student.payer_email), '') IS NOT NULL
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

CREATE OR REPLACE FUNCTION public.get_due_school_installment_reminder_ids(
  p_bucket text,
  p_reference_date date,
  p_limit integer DEFAULT 25
)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT installment.id
  FROM public.school_payment_installments installment
  JOIN public.school_contracts contract ON contract.id = installment.contract_id
  JOIN public.students student ON student.id = contract.student_id
  JOIN public.organizations organization ON organization.id = contract.organization_id
  WHERE installment.payment_status = 'pending'
    AND contract.archived_at IS NULL
    AND contract.signing_status = 'signed'
    AND organization.stripe_onboarding_complete IS TRUE
    AND NULLIF(btrim(organization.stripe_account_id), '') IS NOT NULL
    AND NULLIF(btrim(COALESCE(student.payer_email, student.email)), '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.email_reminder_opt_outs opt_out
      WHERE lower(opt_out.email) = lower(COALESCE(student.payer_email, student.email))
    )
    AND NOT (
      installment.installment_number = 1
      AND abs(installment.amount - 50) < 0.01
      AND installment.due_date = DATE '2026-07-31'
      AND COALESCE(contract.additional_fee_amount, 0) > 0
    )
    AND (
      (
        p_bucket = 'due_3d'
        AND installment.due_date = p_reference_date
        AND installment.reminder_3d_sent_at IS NULL
      )
      OR (
        p_bucket = 'due_1d'
        AND installment.due_date = p_reference_date
        AND installment.reminder_1d_sent_at IS NULL
      )
      OR (
        p_bucket = 'overdue'
        AND installment.due_date < p_reference_date
        AND installment.reminder_3d_sent_at IS NULL
        AND installment.reminder_1d_sent_at IS NULL
      )
    )
  ORDER BY installment.due_date, installment.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_due_school_installment_reminder_ids(text, date, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_school_installment_reminder_ids(text, date, integer)
  TO service_role;
