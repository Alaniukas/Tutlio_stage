-- Allow org admins to update sessions of tutors in their organization.
-- Required for company calendar actions (mark no-show, toggle paid, cancel, edit).

DROP POLICY IF EXISTS "Org admins can update org sessions" ON public.sessions;

CREATE POLICY "Org admins can update org sessions" ON public.sessions
  FOR UPDATE
  USING (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.organization_id IN (
        SELECT oa.organization_id
        FROM public.organization_admins oa
        WHERE oa.user_id = auth.uid()
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.organization_id IN (
        SELECT oa.organization_id
        FROM public.organization_admins oa
        WHERE oa.user_id = auth.uid()
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

