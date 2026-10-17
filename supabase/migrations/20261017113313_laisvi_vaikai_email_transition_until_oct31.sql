-- Laisvi vaikai keep accountless join/homework reminder emails two more weeks
-- from 2026-10-17. Parent logins will be created after this window. The new
-- cutoff replaces the previous October 21 date.
-- 2026-10-31 23:59:59.999 Europe/Vilnius = 2026-10-31T21:59:59.999Z (UTC+2).
UPDATE public.organizations
SET features = coalesce(features, '{}'::jsonb) || jsonb_build_object(
  'school_family_email_transition_until', '2026-10-31T21:59:59.999Z'
)
WHERE id = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17'
  AND entity_type = 'school'
  AND features->>'school_family_portal' = 'true';
