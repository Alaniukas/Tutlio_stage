-- Reassert that any authenticated user can SELECT from public.availability.
-- Symptom: parents (and other roles) sometimes get an empty response from
-- /rest/v1/availability?tutor_id=eq.<id> even though rows exist. Earlier
-- migrations introduce restrictive overlapping policies; this reaffirms a
-- permissive read-all policy and ensures grants are correct.

-- Make sure the table has RLS on (it should already be, but be explicit).
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;

-- Grants for read paths (idempotent).
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON TABLE public.availability TO anon, authenticated;

-- Drop any stale "availability_public" policy and recreate as permissive read-all.
DROP POLICY IF EXISTS "availability_public" ON public.availability;
CREATE POLICY "availability_public" ON public.availability
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Keep the tutor-specific select policy (so tutors still match by their own
-- auth.uid()), but make sure it doesn't accidentally exist as the *only*
-- select policy with a restrictive USING expression.
DROP POLICY IF EXISTS "availability_select_tutor" ON public.availability;
CREATE POLICY "availability_select_tutor" ON public.availability
  FOR SELECT
  TO authenticated
  USING (auth.uid() = tutor_id);
