-- =====================================================
-- Student Individual Pricing Table
-- =====================================================

CREATE TABLE IF NOT EXISTS student_individual_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  duration_minutes int NOT NULL CHECK (duration_minutes > 0),
  cancellation_hours int NOT NULL DEFAULT 24,
  cancellation_fee_percent int NOT NULL DEFAULT 0 CHECK (cancellation_fee_percent >= 0 AND cancellation_fee_percent <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(student_id, subject_id)
);

ALTER TABLE student_individual_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tutors can view own student pricing" ON student_individual_pricing;
DROP POLICY IF EXISTS "Tutors can insert own student pricing" ON student_individual_pricing;
DROP POLICY IF EXISTS "Tutors can update own student pricing" ON student_individual_pricing;
DROP POLICY IF EXISTS "Tutors can delete own student pricing" ON student_individual_pricing;
DROP POLICY IF EXISTS "Students can view own pricing" ON student_individual_pricing;

CREATE POLICY "Tutors can view own student pricing"
  ON student_individual_pricing FOR SELECT
  USING (tutor_id = auth.uid());

CREATE POLICY "Tutors can insert own student pricing"
  ON student_individual_pricing FOR INSERT
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "Tutors can update own student pricing"
  ON student_individual_pricing FOR UPDATE
  USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "Tutors can delete own student pricing"
  ON student_individual_pricing FOR DELETE
  USING (tutor_id = auth.uid());

CREATE POLICY "Students can view own pricing"
  ON student_individual_pricing FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM students
      WHERE invite_code = current_setting('request.jwt.claims', true)::json->>'invite_code'
    )
  );

CREATE INDEX IF NOT EXISTS idx_student_individual_pricing_student_id ON student_individual_pricing(student_id);
CREATE INDEX IF NOT EXISTS idx_student_individual_pricing_tutor_id ON student_individual_pricing(tutor_id);
CREATE INDEX IF NOT EXISTS idx_student_individual_pricing_subject_id ON student_individual_pricing(subject_id);

GRANT ALL ON TABLE student_individual_pricing TO authenticated, service_role;

COMMENT ON TABLE student_individual_pricing IS 'Custom pricing for individual students (per subject)';
COMMENT ON COLUMN student_individual_pricing.price IS 'Individual price in EUR for this student for this subject';
COMMENT ON COLUMN student_individual_pricing.duration_minutes IS 'Individual lesson duration for this student for this subject';
COMMENT ON COLUMN student_individual_pricing.cancellation_hours IS 'Individual cancellation deadline hours for this student';
COMMENT ON COLUMN student_individual_pricing.cancellation_fee_percent IS 'Individual cancellation fee % for this student';
