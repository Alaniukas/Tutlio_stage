ALTER TABLE public.parent_profiles
  ADD COLUMN IF NOT EXISTS disable_lesson_reminders boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.parent_profiles.disable_lesson_reminders
  IS 'When true, parent will not receive session reminder emails about their children lessons.';
