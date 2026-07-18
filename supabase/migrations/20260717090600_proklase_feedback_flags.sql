-- Pro Klasė feedback round (2026-07-17): enable the new feature flags for the
-- Pro Klasė organization (same name-predicate seed pattern as 20260714090000)
-- and switch its finance defaults to packages/monthly only (no per-lesson
-- student payments).

UPDATE public.organizations
SET features = COALESCE(features, '{}'::jsonb)
  || jsonb_build_object(
       'student_availability_profile', true,
       'student_schedule_overview', true,
       'hide_admin_lesson_prices', true,
       'hide_trial_offer_button', true,
       'full_student_edit', true,
       'trial_creation_payment_email', true,
       'post_trial_auto_package', true,
       'extra_lessons_billing', true,
       'student_payments_page', true,
       'invoice_detailed_line_items', true
     )
WHERE lower(trim(name)) = lower('Pro Klasė');

-- Per-lesson student payments off by default for Pro Klasė (packages/monthly
-- only). The org update below bypasses the app-side propagation, so the org
-- tutors' profile rows are aligned explicitly too.
UPDATE public.organizations
SET enable_per_lesson = false,
    enable_prepaid_packages = true
WHERE lower(trim(name)) = lower('Pro Klasė');

UPDATE public.profiles
SET enable_per_lesson = false,
    enable_prepaid_packages = true
WHERE organization_id IN (
  SELECT id FROM public.organizations WHERE lower(trim(name)) = lower('Pro Klasė')
);
