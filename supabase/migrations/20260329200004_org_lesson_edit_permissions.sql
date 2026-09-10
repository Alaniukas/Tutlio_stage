-- Feature #18: Granular lesson-edit permissions for org tutors
-- Adds a jsonb column to organizations that controls which session fields
-- org tutors are allowed to modify.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS org_tutor_edit_permissions jsonb
    DEFAULT '{"price": false, "duration": false, "subject": false, "meeting_link": true, "notes": true}'::jsonb;
