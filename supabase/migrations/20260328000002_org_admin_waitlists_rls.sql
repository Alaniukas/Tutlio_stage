-- Įmonės administratoriai: matyti ir valdyti visų įmonės korepetitorių laukimo eiles

DROP POLICY IF EXISTS "waitlists_select" ON public.waitlists;
CREATE POLICY "waitlists_select" ON public.waitlists FOR SELECT
  USING (
    auth.uid() = tutor_id
    OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id AND oa.user_id = auth.uid()
      WHERE p.id = waitlists.tutor_id
    )
  );

DROP POLICY IF EXISTS "waitlists_insert" ON public.waitlists;
CREATE POLICY "waitlists_insert" ON public.waitlists FOR INSERT
  WITH CHECK (
    (
      auth.uid() = tutor_id
      OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id AND oa.user_id = auth.uid()
        WHERE p.id = tutor_id
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "waitlists_update" ON public.waitlists;
CREATE POLICY "waitlists_update" ON public.waitlists FOR UPDATE
  USING (
    (
      auth.uid() = tutor_id
      OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id AND oa.user_id = auth.uid()
        WHERE p.id = waitlists.tutor_id
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    (
      auth.uid() = tutor_id
      OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id AND oa.user_id = auth.uid()
        WHERE p.id = tutor_id
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "waitlists_delete" ON public.waitlists;
CREATE POLICY "waitlists_delete" ON public.waitlists FOR DELETE
  USING (
    (
      auth.uid() = tutor_id
      OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id AND oa.user_id = auth.uid()
        WHERE p.id = waitlists.tutor_id
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );
