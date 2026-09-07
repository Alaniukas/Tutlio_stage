-- Auto monthly package plans derived from the student's recurring schedule
-- (post-trial automation): unlike manual plans they are multi-subject, so
-- subject_id becomes nullable; items are re-derived from the student's active
-- recurring templates at each generation. created_from_trial_session_id is the
-- idempotency anchor for the post-trial cron; the partial unique index allows
-- one active auto plan per (tutor, student).

ALTER TABLE public.recurring_monthly_package_plans
  ALTER COLUMN subject_id DROP NOT NULL;

ALTER TABLE public.recurring_monthly_package_plans
  ADD COLUMN IF NOT EXISTS auto_from_schedule boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_from_trial_session_id uuid
    REFERENCES public.sessions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.recurring_monthly_package_plans.auto_from_schedule IS
  'True for plans created by the post-trial automation: subject_id is NULL and package items are re-derived from the student''s active recurring_individual_sessions templates (at the current dynamic-pricing tier) every generation.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_plans_auto_one_per_pair
  ON public.recurring_monthly_package_plans (tutor_id, student_id)
  WHERE active = true AND auto_from_schedule = true;
