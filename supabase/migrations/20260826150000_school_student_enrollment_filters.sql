-- School student enrollment metadata for list filters + archive

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS school_year text,
  ADD COLUMN IF NOT EXISTS enrollment_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS municipality text,
  ADD COLUMN IF NOT EXISTS exit_date date,
  ADD COLUMN IF NOT EXISTS exit_reason text,
  ADD COLUMN IF NOT EXISTS exit_note text,
  ADD COLUMN IF NOT EXISTS has_debt_manual boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'students_enrollment_status_check'
      AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_enrollment_status_check
      CHECK (enrollment_status IN ('active', 'future', 'left', 'graduated'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'students_exit_reason_check'
      AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_exit_reason_check
      CHECK (
        exit_reason IS NULL OR exit_reason IN (
          'chose_other_school',
          'returned_to_contact',
          'moved_abroad',
          'school_terminated',
          'other'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'students_school_year_check'
      AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_school_year_check
      CHECK (school_year IS NULL OR school_year ~ '^[0-9]{4}/[0-9]{4}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_students_org_enrollment
  ON public.students(organization_id, enrollment_status)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_org_municipality
  ON public.students(organization_id, municipality)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_org_school_year
  ON public.students(organization_id, school_year)
  WHERE organization_id IS NOT NULL;

COMMENT ON COLUMN public.students.school_year IS 'Manual academic year label, e.g. 2026/2027';
COMMENT ON COLUMN public.students.enrollment_status IS 'active | future | left | graduated; default list shows active only';
COMMENT ON COLUMN public.students.municipality IS 'LT savivaldybė (full name)';
COMMENT ON COLUMN public.students.has_debt_manual IS 'Manual debt flag; auto debt also derived from unpaid installments/monthly invoices';
