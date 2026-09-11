-- Add features jsonb column to organizations for feature flag toggles
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS features jsonb DEFAULT '{}'::jsonb;
