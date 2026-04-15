-- ============================================================
-- COMPREHENSIVE FIX SQL
-- Paste this entire block into Supabase SQL Editor and run.
-- Safe to run multiple times (idempotent).
-- ============================================================

-- ─── PART 1: Missing columns ─────────────────────────────────────────────────

-- subjects: grade_min, grade_max, is_group, max_students
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS grade_min int,
  ADD COLUMN IF NOT EXISTS grade_max int,
  ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS max_students INTEGER;

-- grade range constraint (safe: only add if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'check_grade_range'
      AND conrelid = 'public.subjects'::regclass
  ) THEN
    ALTER TABLE public.subjects ADD CONSTRAINT check_grade_range CHECK (
      (grade_min IS NULL AND grade_max IS NULL)
      OR (grade_min IS NOT NULL AND grade_max IS NOT NULL AND grade_max >= grade_min)
    );
  END IF;
END $$;

-- sessions: missing columns
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS tutor_comment text,
  ADD COLUMN IF NOT EXISTS show_comment_to_student boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS available_spots INTEGER,
  ADD COLUMN IF NOT EXISTS hidden_from_calendar BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- tutor_invites: invitee_phone
ALTER TABLE public.tutor_invites
  ADD COLUMN IF NOT EXISTS invitee_phone text;

-- organizations: org feature columns
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS org_tutors_can_edit_lesson_settings boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS org_tutor_lesson_edit jsonb NOT NULL DEFAULT '{"subjects_pricing": false, "cancellation": false, "registration": false, "reminders": false}'::jsonb,
  ADD COLUMN IF NOT EXISTS enable_per_lesson boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_monthly_billing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_prepaid_packages boolean NOT NULL DEFAULT false;

-- organizations: status check constraint (safe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organizations_status_check'
      AND conrelid = 'public.organizations'::regclass
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_status_check
      CHECK (status IN ('active', 'suspended'));
  END IF;
END $$;

-- profiles: payment feature columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS enable_per_lesson boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_monthly_billing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_prepaid_packages boolean NOT NULL DEFAULT false;

-- ─── PART 2: Tables (lesson_packages, billing_batches, etc.) ─────────────────

CREATE TABLE IF NOT EXISTS public.lesson_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  total_lessons INT NOT NULL CHECK (total_lessons > 0),
  available_lessons INT NOT NULL DEFAULT 0 CHECK (available_lessons >= 0),
  reserved_lessons INT NOT NULL DEFAULT 0 CHECK (reserved_lessons >= 0),
  completed_lessons INT NOT NULL DEFAULT 0 CHECK (completed_lessons >= 0),
  price_per_lesson NUMERIC(10,2) NOT NULL CHECK (price_per_lesson >= 0),
  total_price NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),
  paid BOOLEAN NOT NULL DEFAULT false,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  stripe_checkout_session_id TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  CONSTRAINT lesson_counts_valid CHECK (
    available_lessons + reserved_lessons + completed_lessons <= total_lessons
  )
);

CREATE TABLE IF NOT EXISTS public.billing_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  payment_deadline_days INT NOT NULL DEFAULT 7 CHECK (payment_deadline_days > 0),
  payment_deadline_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  paid BOOLEAN NOT NULL DEFAULT false,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'cancelled')),
  stripe_checkout_session_id TEXT,
  payer_email TEXT NOT NULL DEFAULT '',
  payer_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  CONSTRAINT period_dates_valid CHECK (period_end_date >= period_start_date)
);

CREATE TABLE IF NOT EXISTS public.billing_batch_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_batch_id UUID NOT NULL REFERENCES public.billing_batches(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (billing_batch_id, session_id)
);

-- Add lesson_package_id and payment_batch_id to sessions if missing
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS lesson_package_id UUID REFERENCES public.lesson_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_batch_id UUID REFERENCES public.billing_batches(id) ON DELETE SET NULL;

-- student_individual_pricing table
CREATE TABLE IF NOT EXISTS public.student_individual_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tutor_id, student_id, subject_id)
);

-- platform_admin_audit table
CREATE TABLE IF NOT EXISTS public.platform_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Enable RLS on tables that need it
ALTER TABLE public.lesson_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_batch_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_individual_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admin_audit ENABLE ROW LEVEL SECURITY;

-- ─── PART 3: Functions ───────────────────────────────────────────────────────

-- write_blocked_by_org_suspension: returns true if user's org is suspended
CREATE OR REPLACE FUNCTION public.write_blocked_by_org_suspension()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.organizations o ON o.id = p.organization_id
    WHERE p.id = auth.uid() AND o.status = 'suspended'
  )
  OR EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.profiles p ON p.id = s.tutor_id
    JOIN public.organizations o ON o.id = p.organization_id
    WHERE s.linked_user_id = auth.uid() AND o.status = 'suspended'
  );
$$;

REVOKE ALL ON FUNCTION public.write_blocked_by_org_suspension() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.write_blocked_by_org_suspension() TO authenticated;

-- org_has_feature: check if org has a feature flag enabled
CREATE OR REPLACE FUNCTION public.org_has_feature(org_id uuid, feature_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((features->>feature_id)::boolean, false)
  FROM public.organizations
  WHERE id = org_id;
$$;

-- ─── PART 4: RLS Policies (all critical tables) ───────────────────────────────

-- ── sessions ──
DROP POLICY IF EXISTS "sessions_select" ON public.sessions;
CREATE POLICY "sessions_select" ON public.sessions FOR SELECT
  USING (
    auth.uid() = tutor_id OR
    student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "sessions_insert" ON public.sessions;
CREATE POLICY "sessions_insert" ON public.sessions FOR INSERT
  WITH CHECK (
    (auth.uid() = tutor_id OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid()))
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "sessions_update" ON public.sessions;
CREATE POLICY "sessions_update" ON public.sessions FOR UPDATE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

DROP POLICY IF EXISTS "sessions_delete" ON public.sessions;
CREATE POLICY "sessions_delete" ON public.sessions FOR DELETE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

DROP POLICY IF EXISTS "sessions_student_update" ON public.sessions;
CREATE POLICY "sessions_student_update" ON public.sessions FOR UPDATE
  USING (student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid()) AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid()) AND NOT public.write_blocked_by_org_suspension());

DROP POLICY IF EXISTS "Org admins can view org sessions" ON public.sessions;
CREATE POLICY "Org admins can view org sessions" ON public.sessions FOR SELECT
  USING (tutor_id IN (SELECT id FROM public.profiles WHERE organization_id IN (SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid())));

-- ── students ──
DROP POLICY IF EXISTS "students_select" ON public.students;
CREATE POLICY "students_select" ON public.students FOR SELECT
  USING (auth.uid() = tutor_id);

DROP POLICY IF EXISTS "students_self_select" ON public.students;
CREATE POLICY "students_self_select" ON public.students FOR SELECT
  USING (auth.uid() = linked_user_id);

DROP POLICY IF EXISTS "students_public_invite" ON public.students;
CREATE POLICY "students_public_invite" ON public.students FOR SELECT
  USING (invite_code IS NOT NULL);

DROP POLICY IF EXISTS "Org admin can view org students" ON public.students;
CREATE POLICY "Org admin can view org students" ON public.students FOR SELECT
  USING (tutor_id IN (SELECT id FROM public.profiles WHERE organization_id IN (SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid())));

-- ── availability ──
DROP POLICY IF EXISTS "availability_select_tutor" ON public.availability;
CREATE POLICY "availability_select_tutor" ON public.availability FOR SELECT
  USING (auth.uid() = tutor_id);

DROP POLICY IF EXISTS "availability_public" ON public.availability;
CREATE POLICY "availability_public" ON public.availability FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "availability_manage" ON public.availability;
DROP POLICY IF EXISTS "availability_mutate_tutor" ON public.availability;
CREATE POLICY "availability_mutate_tutor" ON public.availability FOR INSERT
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

DROP POLICY IF EXISTS "availability_update_tutor" ON public.availability;
CREATE POLICY "availability_update_tutor" ON public.availability FOR UPDATE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

DROP POLICY IF EXISTS "availability_delete_tutor" ON public.availability;
CREATE POLICY "availability_delete_tutor" ON public.availability FOR DELETE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

-- ── subjects ──
DROP POLICY IF EXISTS "subjects_public_read" ON public.subjects;
CREATE POLICY "subjects_public_read" ON public.subjects FOR SELECT USING (true);

DROP POLICY IF EXISTS "subjects_select" ON public.subjects;
DROP POLICY IF EXISTS "subjects_tutor_select" ON public.subjects;
CREATE POLICY "subjects_tutor_select" ON public.subjects FOR SELECT USING (auth.uid() = tutor_id);

DROP POLICY IF EXISTS "subjects_insert" ON public.subjects;
DROP POLICY IF EXISTS "subjects_tutor_insert" ON public.subjects;
CREATE POLICY "subjects_tutor_insert" ON public.subjects FOR INSERT
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

DROP POLICY IF EXISTS "subjects_update" ON public.subjects;
DROP POLICY IF EXISTS "subjects_tutor_update" ON public.subjects;
CREATE POLICY "subjects_tutor_update" ON public.subjects FOR UPDATE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

DROP POLICY IF EXISTS "subjects_delete" ON public.subjects;
DROP POLICY IF EXISTS "subjects_tutor_delete" ON public.subjects;
CREATE POLICY "subjects_tutor_delete" ON public.subjects FOR DELETE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

DROP POLICY IF EXISTS "Org admins see org subjects" ON public.subjects;
CREATE POLICY "Org admins see org subjects" ON public.subjects FOR SELECT
  USING (tutor_id IN (SELECT id FROM public.profiles WHERE organization_id IN (SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid())));

-- ── student_individual_pricing ──
ALTER TABLE public.student_individual_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tutors can view own student pricing" ON public.student_individual_pricing;
CREATE POLICY "Tutors can view own student pricing" ON public.student_individual_pricing FOR SELECT
  USING (tutor_id = auth.uid());

DROP POLICY IF EXISTS "Students can view own pricing" ON public.student_individual_pricing;
CREATE POLICY "Students can view own pricing" ON public.student_individual_pricing FOR SELECT
  USING (student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid()));

DROP POLICY IF EXISTS "Org admins can view org student pricing" ON public.student_individual_pricing;
CREATE POLICY "Org admins can view org student pricing" ON public.student_individual_pricing FOR SELECT
  USING (tutor_id IN (SELECT id FROM public.profiles WHERE organization_id IN (SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid())));

DROP POLICY IF EXISTS "Tutors can insert own student pricing" ON public.student_individual_pricing;
CREATE POLICY "Tutors can insert own student pricing" ON public.student_individual_pricing FOR INSERT
  WITH CHECK (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension());

DROP POLICY IF EXISTS "Tutors can update own student pricing" ON public.student_individual_pricing;
CREATE POLICY "Tutors can update own student pricing" ON public.student_individual_pricing FOR UPDATE
  USING (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension());

DROP POLICY IF EXISTS "Tutors can delete own student pricing" ON public.student_individual_pricing;
CREATE POLICY "Tutors can delete own student pricing" ON public.student_individual_pricing FOR DELETE
  USING (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension());

-- ── lesson_packages ──
DROP POLICY IF EXISTS "lesson_packages_tutor_all" ON public.lesson_packages;
DROP POLICY IF EXISTS "lesson_packages_tutor_select" ON public.lesson_packages;
CREATE POLICY "lesson_packages_tutor_select" ON public.lesson_packages FOR SELECT
  USING (auth.uid() = tutor_id);

DROP POLICY IF EXISTS "lesson_packages_student_select" ON public.lesson_packages;
CREATE POLICY "lesson_packages_student_select" ON public.lesson_packages FOR SELECT
  USING (student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid()));

DROP POLICY IF EXISTS "lesson_packages_tutor_insert" ON public.lesson_packages;
CREATE POLICY "lesson_packages_tutor_insert" ON public.lesson_packages FOR INSERT
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

DROP POLICY IF EXISTS "lesson_packages_tutor_update" ON public.lesson_packages;
CREATE POLICY "lesson_packages_tutor_update" ON public.lesson_packages FOR UPDATE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

DROP POLICY IF EXISTS "lesson_packages_tutor_delete" ON public.lesson_packages;
CREATE POLICY "lesson_packages_tutor_delete" ON public.lesson_packages FOR DELETE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

-- ── billing_batches ──
DROP POLICY IF EXISTS "billing_batches_tutor_all" ON public.billing_batches;
DROP POLICY IF EXISTS "billing_batches_tutor_select" ON public.billing_batches;
CREATE POLICY "billing_batches_tutor_select" ON public.billing_batches FOR SELECT
  USING (auth.uid() = tutor_id);

DROP POLICY IF EXISTS "billing_batches_tutor_insert" ON public.billing_batches;
CREATE POLICY "billing_batches_tutor_insert" ON public.billing_batches FOR INSERT
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

DROP POLICY IF EXISTS "billing_batches_tutor_update" ON public.billing_batches;
CREATE POLICY "billing_batches_tutor_update" ON public.billing_batches FOR UPDATE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

DROP POLICY IF EXISTS "billing_batches_tutor_delete" ON public.billing_batches;
CREATE POLICY "billing_batches_tutor_delete" ON public.billing_batches FOR DELETE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

-- ── billing_batch_sessions ──
DROP POLICY IF EXISTS "billing_batch_sessions_via_batch" ON public.billing_batch_sessions;
DROP POLICY IF EXISTS "billing_batch_sessions_via_batch_select" ON public.billing_batch_sessions;
CREATE POLICY "billing_batch_sessions_via_batch_select" ON public.billing_batch_sessions FOR SELECT
  USING (billing_batch_id IN (SELECT id FROM public.billing_batches WHERE auth.uid() = tutor_id));

DROP POLICY IF EXISTS "billing_batch_sessions_tutor_mutate" ON public.billing_batch_sessions;
CREATE POLICY "billing_batch_sessions_tutor_mutate" ON public.billing_batch_sessions FOR INSERT
  WITH CHECK (billing_batch_id IN (SELECT id FROM public.billing_batches WHERE auth.uid() = tutor_id) AND NOT public.write_blocked_by_org_suspension());

-- ─── PART 5: Fix lesson_packages → students FK ───────────────────────────────

-- Remove orphaned rows (student was deleted)
DELETE FROM public.lesson_packages
WHERE student_id NOT IN (SELECT id FROM public.students);

-- Add FK if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = rc.constraint_name AND kcu.constraint_schema = rc.constraint_schema
    WHERE rc.constraint_schema = 'public'
      AND kcu.table_name = 'lesson_packages' AND kcu.column_name = 'student_id'
  ) THEN
    ALTER TABLE public.lesson_packages
      ADD CONSTRAINT lesson_packages_student_id_fkey
      FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Same for subject_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = rc.constraint_name AND kcu.constraint_schema = rc.constraint_schema
    WHERE rc.constraint_schema = 'public'
      AND kcu.table_name = 'lesson_packages' AND kcu.column_name = 'subject_id'
  ) THEN
    ALTER TABLE public.lesson_packages
      ADD CONSTRAINT lesson_packages_subject_id_fkey
      FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ─── PART 6: Reload PostgREST schema cache ───────────────────────────────────
NOTIFY pgrst, 'reload schema';
