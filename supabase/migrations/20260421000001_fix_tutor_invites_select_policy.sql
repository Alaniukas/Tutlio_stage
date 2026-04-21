-- Fix: restore SELECT policy on tutor_invites for authenticated users.
-- The "Anyone can read invite by token" policy was dropped in
-- 20260325000001_org_status_platform_admin.sql and never recreated.
-- Without it, invited tutors cannot read their invite during the
-- registration/login flow, so organization_id is never set on their
-- profile and they get stuck on the subscription page.

DROP POLICY IF EXISTS "Authenticated can read invite by token" ON public.tutor_invites;

CREATE POLICY "Authenticated can read invite by token" ON public.tutor_invites
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
