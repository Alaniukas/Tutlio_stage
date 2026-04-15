-- Reinforce org admin RLS for sessions & availability (WITH CHECK + suspension)
-- and allow org admins with full_control to manage recurring templates for org tutors.

-- ─── Sessions ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org admin can update org tutor sessions" ON public.sessions;
CREATE POLICY "Org admin can update org tutor sessions" ON public.sessions
  FOR UPDATE
  USING (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "Org admin can delete org tutor sessions" ON public.sessions;
CREATE POLICY "Org admin can delete org tutor sessions" ON public.sessions
  FOR DELETE
  USING (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "Org admin can create org tutor sessions" ON public.sessions;
CREATE POLICY "Org admin can create org tutor sessions" ON public.sessions
  FOR INSERT
  WITH CHECK (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND (
          public.org_has_feature(p.organization_id, 'org_admin_calendar_view')
          OR public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
        )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

-- ─── Availability ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org admin can update org tutor availability" ON public.availability;
CREATE POLICY "Org admin can update org tutor availability" ON public.availability
  FOR UPDATE
  USING (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "Org admin can create org tutor availability" ON public.availability;
CREATE POLICY "Org admin can create org tutor availability" ON public.availability
  FOR INSERT
  WITH CHECK (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "Org admin can delete org tutor availability" ON public.availability;
CREATE POLICY "Org admin can delete org tutor availability" ON public.availability
  FOR DELETE
  USING (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

-- ─── Recurring templates (org admin creates recurring on behalf of tutor) ─────
DROP POLICY IF EXISTS "Org admin recurring insert" ON public.recurring_individual_sessions;
CREATE POLICY "Org admin recurring insert" ON public.recurring_individual_sessions
  FOR INSERT
  WITH CHECK (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "Org admin recurring update" ON public.recurring_individual_sessions;
CREATE POLICY "Org admin recurring update" ON public.recurring_individual_sessions
  FOR UPDATE
  USING (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "Org admin recurring delete" ON public.recurring_individual_sessions;
CREATE POLICY "Org admin recurring delete" ON public.recurring_individual_sessions
  FOR DELETE
  USING (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  );
