-- Org admins may update individual student pricing for tutors in their organization.

DROP POLICY IF EXISTS "Org admins can update student pricing for org tutors" ON public.student_individual_pricing;

CREATE POLICY "Org admins can update student pricing for org tutors"
  ON public.student_individual_pricing
  FOR UPDATE
  USING (
    NOT public.write_blocked_by_org_suspension()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      INNER JOIN public.organization_admins oa
        ON oa.organization_id = p.organization_id
       AND oa.user_id = auth.uid()
      WHERE p.id = tutor_id
    )
  )
  WITH CHECK (
    NOT public.write_blocked_by_org_suspension()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      INNER JOIN public.organization_admins oa
        ON oa.organization_id = p.organization_id
       AND oa.user_id = auth.uid()
      WHERE p.id = tutor_id
    )
  );

