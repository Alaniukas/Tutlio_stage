-- Org admins may insert/update/delete subjects for tutors in their organization
-- (same pattern as student_individual_pricing org admin policies).

DROP POLICY IF EXISTS "subjects_org_admin_insert" ON public.subjects;
CREATE POLICY "subjects_org_admin_insert" ON public.subjects
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

DROP POLICY IF EXISTS "subjects_org_admin_update" ON public.subjects;
CREATE POLICY "subjects_org_admin_update" ON public.subjects
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

DROP POLICY IF EXISTS "subjects_org_admin_delete" ON public.subjects;
CREATE POLICY "subjects_org_admin_delete" ON public.subjects
  FOR DELETE
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
  );
