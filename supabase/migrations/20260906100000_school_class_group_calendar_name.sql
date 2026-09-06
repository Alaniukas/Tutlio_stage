-- Short calendar label for class groups; contracts keep using `name`.
ALTER TABLE public.school_class_groups
  ADD COLUMN IF NOT EXISTS calendar_name text;

COMMENT ON COLUMN public.school_class_groups.calendar_name IS
  'Optional short label shown in calendars; contracts and PDFs use name.';

-- Per-tutor automated email opt-out (lesson reminders, payment deadline warnings).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_notification_opt_out text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.profiles.email_notification_opt_out IS
  'Cron keys to skip for this tutor profile: lesson_reminder_tutor, lesson_reminder_student, payment_deadline_warning.';

-- Laisvi vaikai: unified Tutlio contact in school emails.
UPDATE public.organizations
SET features = COALESCE(features, '{}'::jsonb)
  || jsonb_build_object(
    'contact_email', 'tutlio@laisvivaikai.lt',
    'school_contract_signing_email', 'tutlio@laisvivaikai.lt'
  )
WHERE id = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
