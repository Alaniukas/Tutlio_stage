-- Fix RLS policies for org tutors (org_korep)
-- They were getting 403 Forbidden because policies were not properly applied

-- =====================================================
-- AVAILABILITY TABLE
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
-- SUBJECTS TABLE
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

-- =====================================================
-- STUDENTS TABLE
-- =====================================================

-- Make sure students SELECT policy exists
DROP POLICY IF EXISTS "students_select" ON public.students;
CREATE POLICY "students_select" ON public.students
  FOR SELECT
  USING (auth.uid() = tutor_id);

-- =====================================================
-- ORG ADMIN POLICIES (simplified)
-- =====================================================

-- Org admins can view org tutor subjects
DROP POLICY IF EXISTS "Org admins see org subjects" ON public.subjects;
CREATE POLICY "Org admins see org subjects" ON public.subjects
  FOR SELECT
  USING (
    tutor_id IN (
      SELECT p.id FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
  );
