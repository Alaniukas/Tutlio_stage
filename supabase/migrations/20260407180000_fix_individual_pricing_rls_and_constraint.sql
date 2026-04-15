-- Fix student_individual_pricing:
-- 1. Change UNIQUE from (student_id, subject_id) to (tutor_id, student_id, subject_id)
-- 2. Clean up all RLS policies
-- 3. Add missing org admin DELETE policy

-- ── 1. Fix UNIQUE constraint ─────────────────────────────────────────────────
ALTER TABLE public.student_individual_pricing
  DROP CONSTRAINT IF EXISTS student_individual_pricing_student_id_subject_id_key;

ALTER TABLE public.student_individual_pricing
  DROP CONSTRAINT IF EXISTS student_individual_pricing_tutor_id_student_id_subject_id_key;

ALTER TABLE public.student_individual_pricing
  ADD CONSTRAINT student_individual_pricing_tutor_id_student_id_subject_id_key
  UNIQUE (tutor_id, student_id, subject_id);

-- ── 2. Drop all existing policies ────────────────────────────────────────────
DROP POLICY IF EXISTS "Tutors can view own student pricing" ON public.student_individual_pricing;
DROP POLICY IF EXISTS "Tutors can insert own student pricing" ON public.student_individual_pricing;
DROP POLICY IF EXISTS "Tutors can update own student pricing" ON public.student_individual_pricing;
DROP POLICY IF EXISTS "Tutors can delete own student pricing" ON public.student_individual_pricing;
DROP POLICY IF EXISTS "Students can view own pricing" ON public.student_individual_pricing;
DROP POLICY IF EXISTS "Org admins can view org student pricing" ON public.student_individual_pricing;
DROP POLICY IF EXISTS "Org admins can insert student pricing for org tutors" ON public.student_individual_pricing;
DROP POLICY IF EXISTS "Org admins can update student pricing for org tutors" ON public.student_individual_pricing;
DROP POLICY IF EXISTS "Org admins can delete student pricing for org tutors" ON public.student_individual_pricing;

-- ── 3. Tutor policies ────────────────────────────────────────────────────────
CREATE POLICY "Tutors can view own student pricing"
  ON public.student_individual_pricing FOR SELECT
  USING (tutor_id = auth.uid());

CREATE POLICY "Tutors can insert own student pricing"
  ON public.student_individual_pricing FOR INSERT
  WITH CHECK (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "Tutors can update own student pricing"
  ON public.student_individual_pricing FOR UPDATE
  USING (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "Tutors can delete own student pricing"
  ON public.student_individual_pricing FOR DELETE
  USING (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension());

-- ── 4. Student SELECT ────────────────────────────────────────────────────────
CREATE POLICY "Students can view own pricing"
  ON public.student_individual_pricing FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE linked_user_id = auth.uid()
    )
  );

-- ── 5. Org admin policies (SELECT + full CRUD) ──────────────────────────────
CREATE POLICY "Org admins can view org student pricing"
  ON public.student_individual_pricing FOR SELECT
  USING (
    tutor_id IN (
      SELECT p.id FROM public.profiles p
      WHERE p.organization_id IN (
        SELECT oa.organization_id FROM public.organization_admins oa WHERE oa.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Org admins can insert student pricing for org tutors"
  ON public.student_individual_pricing FOR INSERT
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

CREATE POLICY "Org admins can update student pricing for org tutors"
  ON public.student_individual_pricing FOR UPDATE
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

CREATE POLICY "Org admins can delete student pricing for org tutors"
  ON public.student_individual_pricing FOR DELETE
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
