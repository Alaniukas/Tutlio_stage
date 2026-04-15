-- =====================================================
-- COMPREHENSIVE FIX - All org tutor issues
-- =====================================================
-- This migration fixes:
-- 1. Missing columns on organizations table
-- 2. All RLS policies for org tutors
-- 3. Student, sessions, subjects, availability access
-- =====================================================

-- =====================================================
-- PART 1: ORGANIZATIONS TABLE COLUMNS
-- =====================================================

-- Add org_tutors_can_edit_lesson_settings (from 20260325000002)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS org_tutors_can_edit_lesson_settings boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.org_tutors_can_edit_lesson_settings IS
  'If true, org tutors may edit subjects/prices in Pamokų nustatymai; if false, only org admin / lesson defaults apply.';

-- Add org_tutor_lesson_edit (from 20260325000003)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS org_tutor_lesson_edit jsonb NOT NULL DEFAULT '{
    "subjects_pricing": false,
    "cancellation": false,
    "registration": false,
    "reminders": false
  }'::jsonb;

COMMENT ON COLUMN public.organizations.org_tutor_lesson_edit IS
  'Org tutor may edit: subjects_pricing, cancellation, registration (booking/break), reminders';

-- Sync trigger for payment flags (from 20260325000002)
CREATE OR REPLACE FUNCTION public.sync_org_payment_flags_to_org_tutors()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.enable_per_lesson IS DISTINCT FROM OLD.enable_per_lesson
    OR NEW.enable_monthly_billing IS DISTINCT FROM OLD.enable_monthly_billing
    OR NEW.enable_prepaid_packages IS DISTINCT FROM OLD.enable_prepaid_packages
  ) THEN
    UPDATE public.profiles p
    SET
      enable_per_lesson = NEW.enable_per_lesson,
      enable_monthly_billing = NEW.enable_monthly_billing,
      enable_prepaid_packages = NEW.enable_prepaid_packages
    WHERE p.organization_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_org_payment_flags ON public.organizations;
CREATE TRIGGER trg_sync_org_payment_flags
  AFTER UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_org_payment_flags_to_org_tutors();

-- =====================================================
-- PART 2: STUDENTS TABLE RLS
-- =====================================================

DROP POLICY IF EXISTS "students_select" ON public.students;
CREATE POLICY "students_select" ON public.students
  FOR SELECT
  USING (auth.uid() = tutor_id);

-- =====================================================
-- PART 3: STUDENT_INDIVIDUAL_PRICING RLS
-- =====================================================

-- Tutors can view their own student pricing
DROP POLICY IF EXISTS "Tutors can view own student pricing" ON public.student_individual_pricing;
CREATE POLICY "Tutors can view own student pricing"
  ON public.student_individual_pricing FOR SELECT
  USING (tutor_id = auth.uid());

-- Students can view their own pricing
DROP POLICY IF EXISTS "Students can view own pricing" ON public.student_individual_pricing;
CREATE POLICY "Students can view own pricing"
  ON public.student_individual_pricing FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE linked_user_id = auth.uid()
    )
  );

-- Org admins can view pricing for students of tutors in their org
DROP POLICY IF EXISTS "Org admins can view org student pricing" ON public.student_individual_pricing;
CREATE POLICY "Org admins can view org student pricing"
  ON public.student_individual_pricing FOR SELECT
  USING (
    tutor_id IN (
      SELECT id FROM public.profiles
      WHERE organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
    )
  );

-- =====================================================
-- PART 4: AVAILABILITY TABLE RLS
-- =====================================================

-- Drop all existing policies and recreate cleanly
DROP POLICY IF EXISTS "availability_select_tutor" ON public.availability;
DROP POLICY IF EXISTS "availability_public" ON public.availability;
DROP POLICY IF EXISTS "availability_mutate_tutor" ON public.availability;
DROP POLICY IF EXISTS "availability_update_tutor" ON public.availability;
DROP POLICY IF EXISTS "availability_delete_tutor" ON public.availability;
DROP POLICY IF EXISTS "Org admin can view org tutor availability" ON public.availability;

-- SELECT: Tutors can view their own availability
CREATE POLICY "availability_select_tutor" ON public.availability
  FOR SELECT
  USING (auth.uid() = tutor_id);

-- SELECT: Public can view all availability (for booking calendar)
CREATE POLICY "availability_public" ON public.availability
  FOR SELECT
  USING (true);

-- INSERT: Tutors can create their own availability (if not suspended)
CREATE POLICY "availability_mutate_tutor" ON public.availability
  FOR INSERT
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

-- UPDATE: Tutors can update their own availability (if not suspended)
CREATE POLICY "availability_update_tutor" ON public.availability
  FOR UPDATE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

-- DELETE: Tutors can delete their own availability (if not suspended)
CREATE POLICY "availability_delete_tutor" ON public.availability
  FOR DELETE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

-- =====================================================
-- PART 5: SUBJECTS TABLE RLS
-- =====================================================

-- Drop all existing policies and recreate cleanly
DROP POLICY IF EXISTS "subjects_public_read" ON public.subjects;
DROP POLICY IF EXISTS "subjects_tutor_select" ON public.subjects;
DROP POLICY IF EXISTS "subjects_tutor_insert" ON public.subjects;
DROP POLICY IF EXISTS "subjects_tutor_update" ON public.subjects;
DROP POLICY IF EXISTS "subjects_tutor_delete" ON public.subjects;
DROP POLICY IF EXISTS "Tutor subject insert" ON public.subjects;
DROP POLICY IF EXISTS "Tutor subject update" ON public.subjects;
DROP POLICY IF EXISTS "Tutor subject delete" ON public.subjects;
DROP POLICY IF EXISTS "Org admins see org subjects" ON public.subjects;

-- SELECT: Public can view all subjects (for booking)
CREATE POLICY "subjects_public_read" ON public.subjects
  FOR SELECT
  USING (true);

-- INSERT: Tutors can create their own subjects (if not suspended)
CREATE POLICY "subjects_tutor_insert" ON public.subjects
  FOR INSERT
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

-- UPDATE: Tutors can update their own subjects (if not suspended)
CREATE POLICY "subjects_tutor_update" ON public.subjects
  FOR UPDATE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

-- DELETE: Tutors can delete their own subjects (if not suspended)
CREATE POLICY "subjects_tutor_delete" ON public.subjects
  FOR DELETE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

-- Org admins can view org tutor subjects
CREATE POLICY "Org admins see org subjects" ON public.subjects
  FOR SELECT
  USING (
    tutor_id IN (
      SELECT p.id FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
  );

-- =====================================================
-- PART 6: SESSIONS TABLE RLS
-- =====================================================

-- Ensure tutor can SELECT their own sessions
DROP POLICY IF EXISTS "sessions_select" ON public.sessions;
CREATE POLICY "sessions_select" ON public.sessions
  FOR SELECT
  USING (
    auth.uid() = tutor_id OR
    student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
  );

-- =====================================================
-- DONE
-- =====================================================

COMMENT ON COLUMN public.organizations.org_tutor_lesson_edit IS
  'FIXED: All RLS policies and org columns added - org tutors should now have full access';
