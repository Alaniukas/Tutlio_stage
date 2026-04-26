-- D2: Tutor license management system
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS tutor_license_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_active_license boolean NOT NULL DEFAULT false;
