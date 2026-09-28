-- Recordings-only revocation preserves the person's account, child links, and billing contacts.
CREATE TABLE IF NOT EXISTS public.school_recording_access_denials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(trim(email)) AND position('@' IN email) > 1),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

CREATE INDEX IF NOT EXISTS idx_school_recording_access_denials_user
  ON public.school_recording_access_denials(organization_id, user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.school_recording_access_denials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_recording_access_denials FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_recording_access_denials TO service_role;

COMMENT ON TABLE public.school_recording_access_denials IS
  'School-scoped student/parent recording access denial by email and optional Auth user. Managed only by authorized API; anonymous legacy homework links have no person identity.';
