-- Student-card org admins can add/remove individual prices with students.edit
-- (not only finance.edit). Restrictive seat policies AND with existing
-- org-ownership policies.

DROP POLICY IF EXISTS org_admin_permission_insert ON public.student_individual_pricing;
CREATE POLICY org_admin_permission_insert ON public.student_individual_pricing
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (private.org_admin_permission_gate(ARRAY['students.edit','finance.edit']));

DROP POLICY IF EXISTS org_admin_permission_update ON public.student_individual_pricing;
CREATE POLICY org_admin_permission_update ON public.student_individual_pricing
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (private.org_admin_permission_gate(ARRAY['students.edit','finance.edit']))
  WITH CHECK (private.org_admin_permission_gate(ARRAY['students.edit','finance.edit']));

DROP POLICY IF EXISTS org_admin_permission_delete ON public.student_individual_pricing;
CREATE POLICY org_admin_permission_delete ON public.student_individual_pricing
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (private.org_admin_permission_gate(ARRAY['students.edit','finance.edit']));
