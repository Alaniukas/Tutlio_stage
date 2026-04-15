-- ============================================================
-- Monthly Payment System Migration
-- Adds support for:
-- 1. Prepaid lesson packages (student pays for X lessons upfront)
-- 2. Monthly billing (tutor sends invoices for completed lessons)
-- ============================================================

-- ─── 1. LESSON PACKAGES TABLE ───────────────────────────────────────────
-- Tracks prepaid lesson packages purchased by students
CREATE TABLE IF NOT EXISTS public.lesson_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,

  -- Lesson counts
  total_lessons INT NOT NULL CHECK (total_lessons > 0),
  available_lessons INT NOT NULL DEFAULT 0 CHECK (available_lessons >= 0),
  reserved_lessons INT NOT NULL DEFAULT 0 CHECK (reserved_lessons >= 0),
  completed_lessons INT NOT NULL DEFAULT 0 CHECK (completed_lessons >= 0),

  -- Pricing
  price_per_lesson NUMERIC(10,2) NOT NULL CHECK (price_per_lesson >= 0),
  total_price NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),

  -- Payment status
  paid BOOLEAN NOT NULL DEFAULT false,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  stripe_checkout_session_id TEXT,

  -- Status
  active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, -- Optional: for future expiry feature

  -- Constraints
  CONSTRAINT lesson_counts_valid CHECK (
    available_lessons + reserved_lessons + completed_lessons <= total_lessons
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_lesson_packages_tutor ON public.lesson_packages(tutor_id);
CREATE INDEX IF NOT EXISTS idx_lesson_packages_student ON public.lesson_packages(student_id);
CREATE INDEX IF NOT EXISTS idx_lesson_packages_subject ON public.lesson_packages(subject_id);
CREATE INDEX IF NOT EXISTS idx_lesson_packages_active ON public.lesson_packages(tutor_id, student_id, active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_lesson_packages_stripe ON public.lesson_packages(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;

-- ─── 2. BILLING BATCHES TABLE ───────────────────────────────────────────
-- Tracks monthly invoices sent by tutors for completed lessons
CREATE TABLE IF NOT EXISTS public.billing_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Period covered by this invoice
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,

  -- Payment deadline
  payment_deadline_days INT NOT NULL CHECK (payment_deadline_days > 0),
  payment_deadline_date TIMESTAMPTZ NOT NULL,

  -- Total amount
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),

  -- Payment status
  paid BOOLEAN NOT NULL DEFAULT false,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'cancelled')),
  stripe_checkout_session_id TEXT,

  -- Payer info (from first session in batch)
  payer_email TEXT NOT NULL,
  payer_name TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT period_dates_valid CHECK (period_end_date >= period_start_date),
  CONSTRAINT period_max_45_days CHECK (period_end_date - period_start_date <= 45)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_billing_batches_tutor ON public.billing_batches(tutor_id);
CREATE INDEX IF NOT EXISTS idx_billing_batches_payer ON public.billing_batches(payer_email);
CREATE INDEX IF NOT EXISTS idx_billing_batches_stripe ON public.billing_batches(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_batches_unpaid ON public.billing_batches(tutor_id, paid) WHERE paid = false;

-- ─── 3. BILLING BATCH SESSIONS JUNCTION TABLE ──────────────────────────
-- Links sessions to billing batches
CREATE TABLE IF NOT EXISTS public.billing_batch_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_batch_id UUID NOT NULL REFERENCES public.billing_batches(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,

  -- Store session details at time of billing (in case session is later modified)
  session_date TIMESTAMPTZ NOT NULL,
  session_price NUMERIC(10,2) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicate sessions in batches
  UNIQUE(session_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_billing_batch_sessions_batch ON public.billing_batch_sessions(billing_batch_id);
CREATE INDEX IF NOT EXISTS idx_billing_batch_sessions_session ON public.billing_batch_sessions(session_id);

-- ─── 4. ADD COLUMNS TO SESSIONS TABLE ──────────────────────────────────
-- Link sessions to lesson packages or billing batches
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS lesson_package_id UUID REFERENCES public.lesson_packages(id) ON DELETE SET NULL;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS payment_batch_id UUID REFERENCES public.billing_batches(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_lesson_package ON public.sessions(lesson_package_id) WHERE lesson_package_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_payment_batch ON public.sessions(payment_batch_id) WHERE payment_batch_id IS NOT NULL;

-- ─── 5. ADD PAYMENT MODEL TO STUDENTS TABLE ────────────────────────────
-- Allow per-student override of payment model
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS payment_model TEXT CHECK (payment_model IN ('per_lesson', 'monthly_billing', 'prepaid_packages'));

-- NULL = use tutor's default
-- Comment for clarity
COMMENT ON COLUMN public.students.payment_model IS 'Override tutor default payment model for this student. NULL = use tutor default.';

-- ─── 6. ADD PAYMENT MODEL FLAGS TO PROFILES TABLE ──────────────────────
-- Global settings for tutor's payment models
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS enable_per_lesson BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS enable_monthly_billing BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS enable_prepaid_packages BOOLEAN NOT NULL DEFAULT false;

-- Comments for clarity
COMMENT ON COLUMN public.profiles.enable_per_lesson IS 'Allow per-lesson payments (before/after lesson)';
COMMENT ON COLUMN public.profiles.enable_monthly_billing IS 'Allow sending monthly invoices for completed lessons';
COMMENT ON COLUMN public.profiles.enable_prepaid_packages IS 'Allow students to buy prepaid lesson packages';

-- ─── 7. ADD PAYMENT MODEL TO ORGANIZATIONS TABLE ───────────────────────
-- Organization defaults for payment models
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS enable_per_lesson BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS enable_monthly_billing BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS enable_prepaid_packages BOOLEAN NOT NULL DEFAULT false;

-- ─── 8. ROW LEVEL SECURITY (RLS) ───────────────────────────────────────

-- Enable RLS on new tables
ALTER TABLE public.lesson_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_batch_sessions ENABLE ROW LEVEL SECURITY;

-- lesson_packages policies
DROP POLICY IF EXISTS "lesson_packages_tutor_all" ON public.lesson_packages;
CREATE POLICY "lesson_packages_tutor_all" ON public.lesson_packages
  FOR ALL USING (auth.uid() = tutor_id);

DROP POLICY IF EXISTS "lesson_packages_student_select" ON public.lesson_packages;
CREATE POLICY "lesson_packages_student_select" ON public.lesson_packages
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "lesson_packages_org_admin_all" ON public.lesson_packages;
CREATE POLICY "lesson_packages_org_admin_all" ON public.lesson_packages
  FOR ALL USING (
    tutor_id IN (
      SELECT p.id FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
  );

-- billing_batches policies
DROP POLICY IF EXISTS "billing_batches_tutor_all" ON public.billing_batches;
CREATE POLICY "billing_batches_tutor_all" ON public.billing_batches
  FOR ALL USING (auth.uid() = tutor_id);

DROP POLICY IF EXISTS "billing_batches_org_admin_all" ON public.billing_batches;
CREATE POLICY "billing_batches_org_admin_all" ON public.billing_batches
  FOR ALL USING (
    tutor_id IN (
      SELECT p.id FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
  );

-- billing_batch_sessions policies (inherit from billing_batches)
DROP POLICY IF EXISTS "billing_batch_sessions_via_batch" ON public.billing_batch_sessions;
CREATE POLICY "billing_batch_sessions_via_batch" ON public.billing_batch_sessions
  FOR ALL USING (
    billing_batch_id IN (
      SELECT id FROM public.billing_batches
      WHERE auth.uid() = tutor_id
    )
  );

DROP POLICY IF EXISTS "billing_batch_sessions_org_admin" ON public.billing_batch_sessions;
CREATE POLICY "billing_batch_sessions_org_admin" ON public.billing_batch_sessions
  FOR ALL USING (
    billing_batch_id IN (
      SELECT bb.id FROM public.billing_batches bb
      INNER JOIN public.profiles p ON p.id = bb.tutor_id
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
  );

-- ─── 9. HELPER FUNCTIONS ────────────────────────────────────────────────

-- Function to get active lesson packages for a student
CREATE OR REPLACE FUNCTION get_student_active_packages(p_student_id UUID)
RETURNS TABLE (
  package_id UUID,
  subject_id UUID,
  subject_name TEXT,
  total_lessons INT,
  available_lessons INT,
  reserved_lessons INT,
  completed_lessons INT,
  price_per_lesson NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lp.id,
    lp.subject_id,
    s.name,
    lp.total_lessons,
    lp.available_lessons,
    lp.reserved_lessons,
    lp.completed_lessons,
    lp.price_per_lesson
  FROM public.lesson_packages lp
  INNER JOIN public.subjects s ON s.id = lp.subject_id
  WHERE lp.student_id = p_student_id
    AND lp.active = true
    AND lp.paid = true
    AND lp.available_lessons > 0
  ORDER BY lp.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get unpaid sessions for billing (max 45 days range)
CREATE OR REPLACE FUNCTION get_unpaid_sessions_for_billing(
  p_tutor_id UUID,
  p_period_start DATE,
  p_period_end DATE
)
RETURNS TABLE (
  session_id UUID,
  student_id UUID,
  student_name TEXT,
  payer_email TEXT,
  payer_name TEXT,
  session_date TIMESTAMPTZ,
  subject_name TEXT,
  price NUMERIC,
  total_count BIGINT
) AS $$
BEGIN
  -- Validate date range
  IF p_period_end - p_period_start > 45 THEN
    RAISE EXCEPTION 'Period cannot exceed 45 days';
  END IF;

  RETURN QUERY
  SELECT
    sess.id,
    sess.student_id,
    st.full_name,
    COALESCE(st.payer_email, st.email) AS payer_email,
    COALESCE(st.payer_name, st.full_name) AS payer_name,
    sess.start_time,
    subj.name,
    sess.price,
    COUNT(*) OVER() AS total_count
  FROM public.sessions sess
  INNER JOIN public.students st ON st.id = sess.student_id
  LEFT JOIN public.subjects subj ON subj.id = sess.subject_id
  WHERE sess.tutor_id = p_tutor_id
    AND sess.status = 'completed'
    AND sess.paid = false
    AND sess.payment_batch_id IS NULL  -- Not already in a batch
    AND sess.lesson_package_id IS NULL  -- Not paid via package
    AND DATE(sess.start_time) >= p_period_start
    AND DATE(sess.start_time) <= p_period_end
  ORDER BY sess.start_time ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 10. COMMENTS FOR DOCUMENTATION ────────────────────────────────────
COMMENT ON TABLE public.lesson_packages IS 'Prepaid lesson packages - students pay upfront for X lessons of a subject';
COMMENT ON TABLE public.billing_batches IS 'Monthly invoices sent by tutors for completed lessons in a period';
COMMENT ON TABLE public.billing_batch_sessions IS 'Junction table linking sessions to billing batches';

COMMENT ON COLUMN public.lesson_packages.available_lessons IS 'Lessons that can still be booked (not yet reserved)';
COMMENT ON COLUMN public.lesson_packages.reserved_lessons IS 'Lessons that are booked but not yet completed';
COMMENT ON COLUMN public.lesson_packages.completed_lessons IS 'Lessons that have been completed';

COMMENT ON COLUMN public.sessions.lesson_package_id IS 'If paid via prepaid package, reference to that package';
COMMENT ON COLUMN public.sessions.payment_batch_id IS 'If included in monthly invoice, reference to that batch';
