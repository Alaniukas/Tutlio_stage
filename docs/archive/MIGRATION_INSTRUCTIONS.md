# 🔧 Migracijos instrukcijos

## Reikia paleisti šias migracijas Supabase:

### 1️⃣ Eik į Supabase Dashboard
- https://supabase.com/dashboard
- Pasirink projektą: `sqrgytpgtieqvkoctcyi`
- Kairėje meniu: **SQL Editor**

### 2️⃣ Nukopijuok ir paleisk šį SQL:

```sql
-- =====================================================
-- 1. Add payment model columns to profiles
-- =====================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS enable_per_lesson BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS enable_monthly_billing BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS enable_prepaid_packages BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.enable_per_lesson IS 'Allow per-lesson payments (before/after lesson)';
COMMENT ON COLUMN public.profiles.enable_monthly_billing IS 'Allow sending monthly invoices for completed lessons';
COMMENT ON COLUMN public.profiles.enable_prepaid_packages IS 'Allow students to buy prepaid lesson packages';

-- =====================================================
-- 2. Create student_individual_pricing table
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
```

### 3️⃣ Spausk **RUN** arba Ctrl+Enter

---

## 🚀 Kaip testuoti API endpoints lokaliai:

### ❌ **NEVEIKS:**
```bash
npm run dev  # Vite dev serveris - API routes neveikia!
```

### ✅ **VEIKS:**
```bash
npm start    # Vercel dev - veikia visi API routes
```

Arba:
```bash
vercel dev --listen 3000 --yes
```

Po to atidaryti: http://localhost:3000

---

## ✅ Patikrinimas

Po migracijos turėtum galėti:
1. ✅ Išsaugoti mokėjimo modelius Finance puslapyje
2. ✅ Siųsti paketą mokiniui (Students → Siųsti paketą)
3. ✅ Siųsti sąskaitas visiems (Finance → Siųsti sąskaitas visiems mokiniams)
