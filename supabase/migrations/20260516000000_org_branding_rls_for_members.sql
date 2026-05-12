-- Allow org tutors, students, and parents to read their own organization row
-- (needed for whitelabel branding on student/parent/tutor pages).

-- Org tutor can read
DROP POLICY IF EXISTS "org_tutor_can_read_own_org" ON public.organizations;
CREATE POLICY "org_tutor_can_read_own_org" ON public.organizations
  FOR SELECT USING (
    id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid() AND organization_id IS NOT NULL)
  );

-- Student linked to org can read
DROP POLICY IF EXISTS "org_student_can_read_own_org" ON public.organizations;
CREATE POLICY "org_student_can_read_own_org" ON public.organizations
  FOR SELECT USING (
    id IN (
      SELECT COALESCE(s.organization_id, p.organization_id)
      FROM public.students s
      LEFT JOIN public.profiles p ON p.id = s.tutor_id
      WHERE s.linked_user_id = auth.uid()
        AND COALESCE(s.organization_id, p.organization_id) IS NOT NULL
    )
  );

-- Parent can read child's org
DROP POLICY IF EXISTS "org_parent_can_read_child_org" ON public.organizations;
CREATE POLICY "org_parent_can_read_child_org" ON public.organizations
  FOR SELECT USING (
    id IN (
      SELECT COALESCE(s.organization_id, p.organization_id)
      FROM public.parent_profiles pp
      JOIN public.parent_students ps ON ps.parent_id = pp.id
      JOIN public.students s ON s.id = ps.student_id
      LEFT JOIN public.profiles p ON p.id = s.tutor_id
      WHERE pp.user_id = auth.uid()
        AND COALESCE(s.organization_id, p.organization_id) IS NOT NULL
    )
  );
