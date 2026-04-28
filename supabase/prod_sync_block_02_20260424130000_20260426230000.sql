-- PROD sync block 02: 20260424130000..20260426230000


-- =============================
-- FILE: 20260424130000_school_contract_template_pdf.sql
-- =============================

-- Add optional PDF support for school contract templates/contracts
ALTER TABLE public.school_contract_templates
  ADD COLUMN IF NOT EXISTS pdf_url text;

ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS pdf_url text;

-- Public bucket for school contract templates (PDF files)
INSERT INTO storage.buckets (id, name, public)
VALUES ('school-contracts', 'school-contracts', true)
ON CONFLICT (id) DO NOTHING;

-- Basic authenticated access to school-contracts bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'school_contracts_authenticated_read'
  ) THEN
    CREATE POLICY "school_contracts_authenticated_read"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'school-contracts');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'school_contracts_authenticated_insert'
  ) THEN
    CREATE POLICY "school_contracts_authenticated_insert"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'school-contracts');
  END IF;
END$$;


-- =============================
-- FILE: 20260425140000_student_admin_comments.sql
-- =============================

-- A1: Admin comments on students with visibility control
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS admin_comment text,
  ADD COLUMN IF NOT EXISTS admin_comment_visible_to_tutor boolean NOT NULL DEFAULT false;

-- =============================
-- FILE: 20260425140001_org_invoice_issuer_mode.sql
-- =============================

-- A5: Invoice issuer mode for organizations
-- Determines who issues invoices: the company, the tutor, or both
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS invoice_issuer_mode text NOT NULL DEFAULT 'both'
    CHECK (invoice_issuer_mode IN ('company', 'tutor', 'both'));

-- =============================
-- FILE: 20260425140002_student_detached_at.sql
-- =============================

-- A6: Soft detach students from organization instead of hard delete
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS detached_at timestamptz;

-- =============================
-- FILE: 20260425140003_personal_meeting_links.sql
-- =============================

-- A7: Tutor custom permanent meeting link
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS personal_meeting_link text;

-- A8: Student custom permanent meeting link
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS personal_meeting_link text;

-- =============================
-- FILE: 20260425140004_student_payment_methods.sql
-- =============================

-- B3: Multiple payment methods per student
CREATE TABLE IF NOT EXISTS public.student_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  payment_method text NOT NULL CHECK (payment_method IN ('stripe', 'manual', 'bank_transfer', 'cash')),
  is_default boolean NOT NULL DEFAULT false,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_payment_methods_student
  ON public.student_payment_methods(student_id);

-- =============================
-- FILE: 20260425140005_parent_accounts.sql
-- =============================

-- D1: Parent accounts system
CREATE TABLE IF NOT EXISTS public.parent_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_profiles_user
  ON public.parent_profiles(user_id);

CREATE TABLE IF NOT EXISTS public.parent_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES public.parent_profiles(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(parent_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_parent_students_parent
  ON public.parent_students(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_students_student
  ON public.parent_students(student_id);

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS parent_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- =============================
-- FILE: 20260425140006_tutor_licenses.sql
-- =============================

-- D2: Tutor license management system
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS tutor_license_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_active_license boolean NOT NULL DEFAULT false;

-- =============================
-- FILE: 20260426120000_seed_laisvi_vaikai_school.sql
-- =============================

-- Seed "Laisvi Vaikai" school: mark as school + insert 3 agreement templates.
-- Org, user, profile, and admin link were created via API; this migration
-- only handles fields and data that depend on the school-module schema.

-- Mark the org as a school (entity_type added by 20260420000001)
UPDATE public.organizations
SET entity_type = 'school'
WHERE id = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';

-- Insert 3 agreement templates (table + pdf_url from earlier migrations)
INSERT INTO public.school_contract_templates
  (organization_id, name, body, pdf_url)
VALUES
  (
    '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17',
    'Metinė sutartis – Pradinis ugdymas',
    '',
    'https://cuhciqwmqfuajeeqjjbm.supabase.co/storage/v1/object/public/school-contracts/2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17/sutartis-pradinis-2026.docx'
  ),
  (
    '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17',
    'Metinė sutartis – Priešmokyklinis ugdymas',
    '',
    'https://cuhciqwmqfuajeeqjjbm.supabase.co/storage/v1/object/public/school-contracts/2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17/sutartis-priesmokyklinis-2026.docx'
  ),
  (
    '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17',
    'Metinė sutartis – Pagrindinis ugdymas',
    '',
    'https://cuhciqwmqfuajeeqjjbm.supabase.co/storage/v1/object/public/school-contracts/2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17/sutartis-pagrindinis-2026.docx'
  )
ON CONFLICT DO NOTHING;
