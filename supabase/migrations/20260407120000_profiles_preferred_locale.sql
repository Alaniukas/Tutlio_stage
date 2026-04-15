-- Add preferred_locale to profiles so locale survives localStorage loss
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_locale text
    DEFAULT NULL
    CHECK (preferred_locale IS NULL OR preferred_locale IN ('lt', 'en', 'pl', 'lv', 'ee'));
