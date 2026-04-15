-- =====================================================
-- Migration: 20260407100000_cancellation_penalties.sql
-- Late cancellation penalty system: fractional package credits,
-- penalty tracking on sessions, student credit balance.
-- =====================================================

-- ─── 1. LESSON PACKAGES: INT → NUMERIC for fractional credits ────────────

-- Drop the existing constraint first (it references the columns being altered)
ALTER TABLE public.lesson_packages
  DROP CONSTRAINT IF EXISTS lesson_counts_valid;

ALTER TABLE public.lesson_packages
  ALTER COLUMN available_lessons TYPE numeric(10,2),
  ALTER COLUMN reserved_lessons  TYPE numeric(10,2),
  ALTER COLUMN completed_lessons TYPE numeric(10,2);

-- Re-create constraint with numeric-friendly check
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lesson_counts_valid'
  ) THEN
    ALTER TABLE public.lesson_packages
      ADD CONSTRAINT lesson_counts_valid CHECK (
        available_lessons + reserved_lessons + completed_lessons <= total_lessons
      );
  END IF;
END $$;

-- ─── 2. SESSIONS: penalty tracking columns ───────────────────────────────

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS is_late_cancelled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_fee_percent_applied int,
  ADD COLUMN IF NOT EXISTS cancellation_penalty_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS penalty_resolution text;

-- Add check constraint separately so IF NOT EXISTS on column doesn't conflict
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_penalty_resolution_check'
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_penalty_resolution_check
      CHECK (penalty_resolution IS NULL OR penalty_resolution IN (
        'pending', 'credit_applied', 'refunded', 'invoiced', 'paid'
      ));
  END IF;
END $$;

-- ─── 3. STUDENTS: credit balance for per-lesson refund-as-credit ─────────

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS credit_balance numeric(10,2) DEFAULT 0;

-- ─── 4. UPDATE get_student_active_packages to return numeric types ───────

DROP FUNCTION IF EXISTS get_student_active_packages(UUID);

CREATE OR REPLACE FUNCTION get_student_active_packages(p_student_id UUID)
RETURNS TABLE (
  package_id UUID,
  subject_id UUID,
  subject_name TEXT,
  total_lessons INT,
  available_lessons NUMERIC,
  reserved_lessons NUMERIC,
  completed_lessons NUMERIC,
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

-- ─── 5. UPDATE get_unpaid_sessions_for_billing to include late-cancelled ─

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
    CASE
      WHEN sess.status = 'cancelled' AND sess.is_late_cancelled = true
        THEN COALESCE(sess.cancellation_penalty_amount, 0)
      ELSE sess.price
    END AS price,
    COUNT(*) OVER() AS total_count
  FROM public.sessions sess
  INNER JOIN public.students st ON st.id = sess.student_id
  LEFT JOIN public.subjects subj ON subj.id = sess.subject_id
  WHERE sess.tutor_id = p_tutor_id
    AND (
      sess.status = 'completed'
      OR (sess.status = 'cancelled' AND sess.is_late_cancelled = true AND sess.penalty_resolution = 'invoiced')
    )
    AND sess.paid = false
    AND sess.payment_batch_id IS NULL
    AND sess.lesson_package_id IS NULL
    AND DATE(sess.start_time) >= p_period_start
    AND DATE(sess.start_time) <= p_period_end
  ORDER BY sess.start_time ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 6. INDEXES for penalty queries ─────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sessions_late_cancelled
  ON public.sessions(is_late_cancelled)
  WHERE is_late_cancelled = true;

CREATE INDEX IF NOT EXISTS idx_sessions_penalty_resolution
  ON public.sessions(penalty_resolution)
  WHERE penalty_resolution IS NOT NULL;

-- ─── 7. COMMENTS ────────────────────────────────────────────────────────

COMMENT ON COLUMN public.sessions.is_late_cancelled IS 'True if session was cancelled after the cancellation deadline';
COMMENT ON COLUMN public.sessions.cancellation_fee_percent_applied IS 'The fee % that was applied at cancellation time';
COMMENT ON COLUMN public.sessions.cancellation_penalty_amount IS 'Calculated penalty in EUR (price * fee_percent / 100)';
COMMENT ON COLUMN public.sessions.penalty_resolution IS 'How the penalty was resolved: pending, credit_applied, refunded, invoiced, paid';
COMMENT ON COLUMN public.students.credit_balance IS 'Credit balance in EUR from overpaid cancelled lessons, applied to future lessons';
