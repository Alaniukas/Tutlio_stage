-- Org-level subject definitions when no tutor is assigned yet (CompanySettings).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS org_subject_templates jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.organizations.org_subject_templates IS
  'JSON array of {id, name, duration_minutes, price, color, ...} — dalykai be priskirto korepetitoriaus; vėliau galima priskirti ar kopijuoti į subjects.';
