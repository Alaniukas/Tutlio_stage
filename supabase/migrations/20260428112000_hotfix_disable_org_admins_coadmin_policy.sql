-- Emergency hotfix:
-- disable co-admin read policy on organization_admins because it still triggers
-- recursion in production for authenticated SELECT checks during login.
--
-- Security stance remains strict (no public access): users can read only own row.

DROP POLICY IF EXISTS "Org admin reads co-admins same org" ON public.organization_admins;

