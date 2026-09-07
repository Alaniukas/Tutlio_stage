-- Org feature `disable_student_booking`: students/parents cannot self-book
-- lessons — lessons are created only by the tutor / org admin. The portal
-- hides booking entry points; this migration enforces the rule at the
-- sessions INSERT layer so hidden UI cannot be bypassed via direct API calls.

-- The student's organization: students.organization_id, falling back to the
-- tutor's profile org (students/parents carry no organization_id themselves).
CREATE OR REPLACE FUNCTION public.student_self_booking_disabled(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT public.org_has_feature(
        COALESCE(s.organization_id, p.organization_id),
        'disable_student_booking'
      )
      FROM public.students s
      LEFT JOIN public.profiles p ON p.id = s.tutor_id
      WHERE s.id = p_student_id
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.student_self_booking_disabled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_self_booking_disabled(uuid) TO authenticated;

-- Same policy shape as 20260502120000, with the self-booking guard added to
-- the student/parent branches. Tutor inserts (and service role) unchanged.
DROP POLICY IF EXISTS "sessions_insert" ON public.sessions;
CREATE POLICY "sessions_insert" ON public.sessions FOR INSERT
  WITH CHECK (
    (
      auth.uid() = tutor_id OR
      (
        (
          student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid()) OR
          student_id IN (
            SELECT ps.student_id
            FROM public.parent_students ps
            JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
          )
        )
        AND NOT public.student_self_booking_disabled(student_id)
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

-- Requested by Pro Klasė: their students/parents must not self-book. The name
-- predicate keeps this seed out of every other organization (same pattern as
-- the dynamic-pricing seed).
UPDATE public.organizations
SET features = COALESCE(features, '{}'::jsonb)
  || jsonb_build_object('disable_student_booking', true)
WHERE lower(trim(name)) = lower('Pro Klasė');
