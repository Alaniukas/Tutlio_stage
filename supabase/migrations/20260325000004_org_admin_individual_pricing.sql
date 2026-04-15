-- Org admins may add individual student pricing for tutors in their organization.

DROP POLICY IF EXISTS "Org admins can insert student pricing for org tutors" ON public.student_individual_pricing;

CREATE POLICY "Org admins can insert student pricing for org tutors" ON public.student_individual_pricing
  FOR INSERT
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
