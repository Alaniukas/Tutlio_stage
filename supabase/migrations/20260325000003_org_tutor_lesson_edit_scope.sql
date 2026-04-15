-- Granular control: which lesson-settings areas org tutors may edit (JSON).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS org_tutor_lesson_edit jsonb NOT NULL DEFAULT '{
    "subjects_pricing": false,
    "cancellation": false,
    "registration": false,
    "reminders": false
  }'::jsonb;

COMMENT ON COLUMN public.organizations.org_tutor_lesson_edit IS
  'Org tutor may edit: subjects_pricing, cancellation, registration (booking/break), reminders';

-- One-time align from legacy boolean (safe on first apply)
UPDATE public.organizations
SET org_tutor_lesson_edit = jsonb_build_object(
  'subjects_pricing', COALESCE(org_tutors_can_edit_lesson_settings, false),
  'cancellation', COALESCE(org_tutors_can_edit_lesson_settings, false),
  'registration', COALESCE(org_tutors_can_edit_lesson_settings, false),
  'reminders', COALESCE(org_tutors_can_edit_lesson_settings, false)
);
