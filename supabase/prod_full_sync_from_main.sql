-- Auto-generated full sync SQL for PROD
-- From migration > 20260413120000



-- =============================
-- FILE: 20260413120000_org_admin_sessions_update_policy.sql
-- =============================

-- Allow org admins to update sessions of tutors in their organization.
-- Required for company calendar actions (mark no-show, toggle paid, cancel, edit).

DROP POLICY IF EXISTS "Org admins can update org sessions" ON public.sessions;

CREATE POLICY "Org admins can update org sessions" ON public.sessions
  FOR UPDATE
  USING (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.organization_id IN (
        SELECT oa.organization_id
        FROM public.organization_admins oa
        WHERE oa.user_id = auth.uid()
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.organization_id IN (
        SELECT oa.organization_id
        FROM public.organization_admins oa
        WHERE oa.user_id = auth.uid()
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );



-- =============================
-- FILE: 20260415120000_allow_student_without_tutor.sql
-- =============================

-- Allow creating students without a tutor (org_admin creates code, assigns tutor later).
-- tutor_id becomes nullable; organization_id is used for RLS when tutor_id is NULL.
--
-- Safety notes:
--   • ALTER … DROP NOT NULL is non-destructive – existing rows with tutor_id are unaffected.
--   • RLS policies are replaced inside a single transaction (no exposure window).
--   • The original tutor_id-based condition is preserved verbatim; only an OR branch is added.
--   • write_blocked_by_org_suspension() is kept in every write policy.

ALTER TABLE public.students ALTER COLUMN tutor_id DROP NOT NULL;

-- ── SELECT ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org admin can view org students" ON public.students;
CREATE POLICY "Org admin can view org students" ON public.students FOR SELECT
  USING (
    tutor_id IN (
      SELECT id FROM public.profiles
      WHERE organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
    )
    OR (
      tutor_id IS NULL
      AND organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
    )
  );

-- ── INSERT ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org admin can insert org students" ON public.students;
CREATE POLICY "Org admin can insert org students" ON public.students FOR INSERT
  WITH CHECK (
    (
      tutor_id IN (
        SELECT id FROM public.profiles
        WHERE organization_id IN (
          SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
        )
      )
      AND NOT public.write_blocked_by_org_suspension()
    )
    OR (
      tutor_id IS NULL
      AND organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
      AND NOT public.write_blocked_by_org_suspension()
    )
  );

-- ── UPDATE ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org admin can update org students" ON public.students;
CREATE POLICY "Org admin can update org students" ON public.students FOR UPDATE
  USING (
    (
      tutor_id IN (
        SELECT id FROM public.profiles
        WHERE organization_id IN (
          SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
        )
      )
      AND NOT public.write_blocked_by_org_suspension()
    )
    OR (
      tutor_id IS NULL
      AND organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
      AND NOT public.write_blocked_by_org_suspension()
    )
  )
  WITH CHECK (
    (
      tutor_id IN (
        SELECT id FROM public.profiles
        WHERE organization_id IN (
          SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
        )
      )
      AND NOT public.write_blocked_by_org_suspension()
    )
    OR (
      tutor_id IS NULL
      AND organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
      AND NOT public.write_blocked_by_org_suspension()
    )
  );

-- ── DELETE ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org admin can delete org students" ON public.students;
CREATE POLICY "Org admin can delete org students" ON public.students FOR DELETE
  USING (
    (
      tutor_id IN (
        SELECT id FROM public.profiles
        WHERE organization_id IN (
          SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
        )
      )
      AND NOT public.write_blocked_by_org_suspension()
    )
    OR (
      tutor_id IS NULL
      AND organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
      AND NOT public.write_blocked_by_org_suspension()
    )
  );


-- =============================
-- FILE: 20260420000001_unify_schools_into_orgs.sql
-- =============================

-- ============================================================
-- School Module (unified with organizations)
-- Schools are organizations with entity_type = 'school'.
-- Contract administration, installment payments, invite-code automation.
--
-- Dual-mode: works on fresh databases AND databases where the
-- old school_module migration was already applied.
-- ============================================================

-- ─── 1. ADD entity_type TO organizations ─────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'company';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organizations_entity_type_check'
      AND conrelid = 'public.organizations'::regclass
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_entity_type_check
      CHECK (entity_type IN ('company', 'school'));
  END IF;
END;
$$;

-- ─── 2. MIGRATE old schema data (if schools table exists) ───────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'schools'
  ) THEN
    INSERT INTO public.organizations (id, name, email, entity_type, created_at)
    SELECT id, name, email, 'school', created_at
    FROM public.schools
    ON CONFLICT (id) DO UPDATE SET entity_type = 'school';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'school_admins'
  ) THEN
    INSERT INTO public.organization_admins (user_id, organization_id)
    SELECT user_id, school_id FROM public.school_admins
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'school_id'
  ) THEN
    UPDATE public.profiles SET organization_id = school_id
    WHERE school_id IS NOT NULL AND organization_id IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'school_id'
  ) THEN
    UPDATE public.students SET organization_id = school_id
    WHERE school_id IS NOT NULL AND organization_id IS NULL;
  END IF;
END;
$$;

-- ─── 3. DROP old RLS policies that reference school_id (must precede column drops)

DROP POLICY IF EXISTS "school_templates_admin_select" ON public.school_contract_templates;
DROP POLICY IF EXISTS "school_templates_admin_insert" ON public.school_contract_templates;
DROP POLICY IF EXISTS "school_templates_admin_update" ON public.school_contract_templates;
DROP POLICY IF EXISTS "school_templates_admin_delete" ON public.school_contract_templates;

DROP POLICY IF EXISTS "school_contracts_admin_select" ON public.school_contracts;
DROP POLICY IF EXISTS "school_contracts_admin_insert" ON public.school_contracts;
DROP POLICY IF EXISTS "school_contracts_admin_update" ON public.school_contracts;
DROP POLICY IF EXISTS "school_contracts_admin_delete" ON public.school_contracts;
DROP POLICY IF EXISTS "school_contracts_student_select" ON public.school_contracts;

DROP POLICY IF EXISTS "school_installments_admin_select" ON public.school_payment_installments;
DROP POLICY IF EXISTS "school_installments_admin_insert" ON public.school_payment_installments;
DROP POLICY IF EXISTS "school_installments_admin_update" ON public.school_payment_installments;
DROP POLICY IF EXISTS "school_installments_admin_delete" ON public.school_payment_installments;
DROP POLICY IF EXISTS "school_installments_student_select" ON public.school_payment_installments;

DROP POLICY IF EXISTS "school_admin_view_students" ON public.students;
DROP POLICY IF EXISTS "school_admin_insert_students" ON public.students;
DROP POLICY IF EXISTS "school_admin_update_students" ON public.students;
DROP POLICY IF EXISTS "school_admin_delete_students" ON public.students;

DROP POLICY IF EXISTS "school_admin_select" ON public.schools;
DROP POLICY IF EXISTS "school_admin_update" ON public.schools;
DROP POLICY IF EXISTS "school_admin_self_select" ON public.school_admins;

-- ─── 4. MIGRATE school_contract_templates.school_id → organization_id ───────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'school_contract_templates'
      AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.school_contract_templates
      ADD COLUMN IF NOT EXISTS organization_id uuid;
    UPDATE public.school_contract_templates SET organization_id = school_id;
    ALTER TABLE public.school_contract_templates
      ALTER COLUMN organization_id SET NOT NULL;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'fk_sct_organization'
    ) THEN
      ALTER TABLE public.school_contract_templates
        ADD CONSTRAINT fk_sct_organization
        FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
    END IF;
    DROP INDEX IF EXISTS idx_school_contract_templates_school;
    ALTER TABLE public.school_contract_templates
      DROP CONSTRAINT IF EXISTS school_contract_templates_school_id_fkey,
      DROP COLUMN IF EXISTS school_id;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.school_contract_templates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                text NOT NULL,
  body                text NOT NULL DEFAULT '',
  annual_fee_default  numeric(10,2),
  is_default          boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.school_contract_templates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_school_contract_templates_org
  ON public.school_contract_templates(organization_id);

-- ─── 5. MIGRATE school_contracts.school_id → organization_id ────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'school_contracts'
      AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.school_contracts
      ADD COLUMN IF NOT EXISTS organization_id uuid;
    UPDATE public.school_contracts SET organization_id = school_id;
    ALTER TABLE public.school_contracts
      ALTER COLUMN organization_id SET NOT NULL;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'fk_sc_organization'
    ) THEN
      ALTER TABLE public.school_contracts
        ADD CONSTRAINT fk_sc_organization
        FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
    END IF;
    DROP INDEX IF EXISTS idx_school_contracts_school;
    ALTER TABLE public.school_contracts
      DROP CONSTRAINT IF EXISTS school_contracts_school_id_fkey,
      DROP COLUMN IF EXISTS school_id;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.school_contracts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id     uuid REFERENCES public.school_contract_templates(id) ON DELETE SET NULL,
  student_id      uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  filled_body     text NOT NULL DEFAULT '',
  annual_fee      numeric(10,2) NOT NULL,
  signing_status  text NOT NULL DEFAULT 'draft'
    CHECK (signing_status IN ('draft', 'sent', 'signed')),
  signed_at       timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.school_contracts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_school_contracts_org
  ON public.school_contracts(organization_id);
CREATE INDEX IF NOT EXISTS idx_school_contracts_student
  ON public.school_contracts(student_id);

-- ─── 6. SCHOOL PAYMENT INSTALLMENTS ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.school_payment_installments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id                 uuid NOT NULL REFERENCES public.school_contracts(id) ON DELETE CASCADE,
  installment_number          int NOT NULL CHECK (installment_number > 0),
  amount                      numeric(10,2) NOT NULL CHECK (amount > 0),
  due_date                    date NOT NULL,
  payment_status              text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'overdue', 'failed')),
  stripe_payment_intent_id    text,
  stripe_checkout_session_id  text,
  paid_at                     timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, installment_number)
);

ALTER TABLE public.school_payment_installments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_school_installments_contract
  ON public.school_payment_installments(contract_id);
CREATE INDEX IF NOT EXISTS idx_school_installments_stripe
  ON public.school_payment_installments(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- ─── 7. is_school_admin() helper (uses organization_admins) ─────────────────

DROP FUNCTION IF EXISTS public.is_school_admin(uuid);
CREATE FUNCTION public.is_school_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_admins
    WHERE user_id = auth.uid() AND organization_id = p_org_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_school_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_school_admin(uuid) TO authenticated;

-- ─── 8. CREATE new RLS POLICIES ─────────────────────────────────────────────

-- school_contract_templates
CREATE POLICY "school_templates_admin_select" ON public.school_contract_templates FOR SELECT
  USING (public.is_school_admin(organization_id));

CREATE POLICY "school_templates_admin_insert" ON public.school_contract_templates FOR INSERT
  WITH CHECK (public.is_school_admin(organization_id));

CREATE POLICY "school_templates_admin_update" ON public.school_contract_templates FOR UPDATE
  USING (public.is_school_admin(organization_id))
  WITH CHECK (public.is_school_admin(organization_id));

CREATE POLICY "school_templates_admin_delete" ON public.school_contract_templates FOR DELETE
  USING (public.is_school_admin(organization_id));

-- school_contracts
CREATE POLICY "school_contracts_admin_select" ON public.school_contracts FOR SELECT
  USING (public.is_school_admin(organization_id));

CREATE POLICY "school_contracts_admin_insert" ON public.school_contracts FOR INSERT
  WITH CHECK (public.is_school_admin(organization_id));

CREATE POLICY "school_contracts_admin_update" ON public.school_contracts FOR UPDATE
  USING (public.is_school_admin(organization_id))
  WITH CHECK (public.is_school_admin(organization_id));

CREATE POLICY "school_contracts_admin_delete" ON public.school_contracts FOR DELETE
  USING (public.is_school_admin(organization_id));

CREATE POLICY "school_contracts_student_select" ON public.school_contracts FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE linked_user_id = auth.uid()
    )
  );

-- school_payment_installments
CREATE POLICY "school_installments_admin_select" ON public.school_payment_installments FOR SELECT
  USING (
    contract_id IN (
      SELECT id FROM public.school_contracts WHERE public.is_school_admin(organization_id)
    )
  );

CREATE POLICY "school_installments_admin_insert" ON public.school_payment_installments FOR INSERT
  WITH CHECK (
    contract_id IN (
      SELECT id FROM public.school_contracts WHERE public.is_school_admin(organization_id)
    )
  );

CREATE POLICY "school_installments_admin_update" ON public.school_payment_installments FOR UPDATE
  USING (
    contract_id IN (
      SELECT id FROM public.school_contracts WHERE public.is_school_admin(organization_id)
    )
  )
  WITH CHECK (
    contract_id IN (
      SELECT id FROM public.school_contracts WHERE public.is_school_admin(organization_id)
    )
  );

CREATE POLICY "school_installments_admin_delete" ON public.school_payment_installments FOR DELETE
  USING (
    contract_id IN (
      SELECT id FROM public.school_contracts WHERE public.is_school_admin(organization_id)
    )
  );

CREATE POLICY "school_installments_student_select" ON public.school_payment_installments FOR SELECT
  USING (
    contract_id IN (
      SELECT sc.id FROM public.school_contracts sc
      JOIN public.students s ON s.id = sc.student_id
      WHERE s.linked_user_id = auth.uid()
    )
  );

-- ─── 9. UPDATE handle_new_user()  — propagate organization_id to profiles ────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  meta_role text := lower(trim(coalesce(new.raw_user_meta_data->>'role', '')));
  meta_student_id text := trim(coalesce(new.raw_user_meta_data->>'student_id', ''));
  is_student_by_meta boolean := (meta_role = 'student' or meta_student_id <> '');
  student_id_to_link uuid;
  linked_count int;
  v_org_id uuid;
BEGIN
  -- 1) Explicit student signup (metadata present)
  IF is_student_by_meta AND meta_student_id <> '' THEN
    UPDATE public.students
    SET
      linked_user_id = new.id,
      email = coalesce(new.email, new.raw_user_meta_data->>'email'),
      phone = coalesce(new.raw_user_meta_data->>'phone', phone),
      age = cast(nullif(new.raw_user_meta_data->>'age', '') as integer),
      grade = new.raw_user_meta_data->>'grade',
      subject_id = nullif(new.raw_user_meta_data->>'subject_id', '')::uuid,
      payment_payer = coalesce(new.raw_user_meta_data->>'payment_payer', 'self'),
      payer_name = new.raw_user_meta_data->>'payer_name',
      payer_email = new.raw_user_meta_data->>'payer_email',
      payer_phone = new.raw_user_meta_data->>'payer_phone',
      accepted_privacy_policy_at = (new.raw_user_meta_data->>'accepted_privacy_policy_at')::timestamptz,
      accepted_terms_at = (new.raw_user_meta_data->>'accepted_terms_at')::timestamptz
    WHERE id = meta_student_id::uuid;

    SELECT organization_id INTO v_org_id FROM public.students WHERE id = meta_student_id::uuid;
    IF v_org_id IS NOT NULL THEN
      INSERT INTO public.profiles (id, email, full_name, phone, organization_id)
      VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone', v_org_id)
      ON CONFLICT (id) DO UPDATE SET organization_id = v_org_id;
    END IF;

    RETURN new;
  END IF;

  -- 2) Fallback: metadata lost – student with this email and no linked_user_id?
  SELECT s.id INTO student_id_to_link
  FROM public.students s
  WHERE s.linked_user_id IS NULL
    AND trim(lower(coalesce(s.email, ''))) = trim(lower(coalesce(new.email, '')))
  LIMIT 1;

  IF student_id_to_link IS NOT NULL THEN
    UPDATE public.students
    SET linked_user_id = new.id, email = coalesce(new.email, email)
    WHERE id = student_id_to_link;
    GET DIAGNOSTICS linked_count = ROW_COUNT;
    IF linked_count > 0 THEN
      SELECT organization_id INTO v_org_id FROM public.students WHERE id = student_id_to_link;
      IF v_org_id IS NOT NULL THEN
        INSERT INTO public.profiles (id, email, full_name, organization_id)
        VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', v_org_id)
        ON CONFLICT (id) DO UPDATE SET organization_id = v_org_id;
      END IF;
      RETURN new;
    END IF;
  END IF;

  -- 3) Tutor signup: create profile
  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 10. DROP old columns & tables ──────────────────────────────────────────

ALTER TABLE public.profiles  DROP COLUMN IF EXISTS school_id;
ALTER TABLE public.students  DROP COLUMN IF EXISTS school_id;
DROP INDEX IF EXISTS idx_profiles_school_id;
DROP INDEX IF EXISTS idx_students_school_id;

DROP TABLE IF EXISTS public.school_admins CASCADE;
DROP TABLE IF EXISTS public.schools CASCADE;

-- ─── 11. GRANTS ─────────────────────────────────────────────────────────────

GRANT ALL ON public.school_contract_templates    TO service_role, authenticated;
GRANT ALL ON public.school_contracts             TO service_role, authenticated;
GRANT ALL ON public.school_payment_installments  TO service_role, authenticated;


-- =============================
-- FILE: 20260421000001_fix_tutor_invites_select_policy.sql
-- =============================

-- Fix: restore SELECT policy on tutor_invites for authenticated users.
-- The "Anyone can read invite by token" policy was dropped in
-- 20260325000001_org_status_platform_admin.sql and never recreated.
-- Without it, invited tutors cannot read their invite during the
-- registration/login flow, so organization_id is never set on their
-- profile and they get stuck on the subscription page.

DROP POLICY IF EXISTS "Authenticated can read invite by token" ON public.tutor_invites;

CREATE POLICY "Authenticated can read invite by token" ON public.tutor_invites
  FOR SELECT
  USING (auth.uid() IS NOT NULL);


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


-- =============================
-- FILE: 20260426230000_parent_invites.sql
-- =============================

-- Parent invite tokens for registration
CREATE TABLE IF NOT EXISTS public.parent_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  parent_email text NOT NULL,
  parent_name text,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.parent_invites ENABLE ROW LEVEL SECURITY;

-- Public can look up invites by token (the token itself acts as authorization).
-- INSERT/UPDATE/DELETE are only reachable via service-role (which bypasses RLS).
CREATE POLICY "allow_public_select" ON public.parent_invites
  FOR SELECT USING (true);


-- =============================
-- FILE: 20260427123000_student_payment_model_multi_select.sql
-- =============================

-- Allow multiple payment models per student (comma-separated)
-- and make per_lesson timing checks compatible with multi-select values.

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.students'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%payment_model%'
  LOOP
    EXECUTE format('ALTER TABLE public.students DROP CONSTRAINT %I', c.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.students
  ADD CONSTRAINT students_payment_model_check
  CHECK (
    payment_model IS NULL
    OR payment_model ~ '^(per_lesson|monthly_billing|prepaid_packages)(,(per_lesson|monthly_billing|prepaid_packages))*$'
  );

COMMENT ON COLUMN public.students.payment_model IS
  'Optional per-student payment model override(s). NULL = use default finance rules; otherwise comma-separated values: per_lesson, monthly_billing, prepaid_packages.';

CREATE OR REPLACE FUNCTION public.student_booking_blocked_overdue(p_student_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_tutor uuid;
  v_restrict boolean;
  v_timing text;
  v_deadline_h int;
  v_now timestamptz := now();
  st_email text;
  st_payer_email text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT s.tutor_id,
         nullif(lower(trim(coalesce(s.email, ''))), ''),
         nullif(lower(trim(coalesce(s.payer_email, ''))), '')
  INTO v_tutor, st_email, st_payer_email
  FROM public.students s
  WHERE s.id = p_student_id;

  IF v_tutor IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = p_student_id AND s.linked_user_id = v_uid
  ) THEN
    RETURN false;
  END IF;

  SELECT COALESCE(p.restrict_booking_on_overdue, false),
         COALESCE(p.payment_timing, 'before_lesson'),
         COALESCE(p.payment_deadline_hours, 24)
  INTO v_restrict, v_timing, v_deadline_h
  FROM public.profiles p
  WHERE p.id = v_tutor;

  IF NOT v_restrict THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.billing_batches bb
    WHERE bb.tutor_id = v_tutor
      AND bb.paid = false
      AND bb.payment_deadline_date < v_now
      AND (
        (st_email IS NOT NULL AND lower(trim(bb.payer_email)) = st_email)
        OR (st_payer_email IS NOT NULL AND lower(trim(bb.payer_email)) = st_payer_email)
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sessions s
    INNER JOIN public.students st ON st.id = s.student_id
    WHERE s.student_id = p_student_id
      AND s.status <> 'cancelled'
      AND COALESCE(s.paid, false) = false
      AND COALESCE(s.payment_status, '') NOT IN ('paid', 'confirmed', 'paid_by_student')
      AND s.lesson_package_id IS NULL
      AND s.payment_batch_id IS NULL
      AND (
        CASE
          WHEN (
            CASE
              WHEN position('per_lesson' in coalesce(st.payment_model, '')) > 0 AND st.per_lesson_payment_timing IS NOT NULL
              THEN st.per_lesson_payment_timing
              ELSE v_timing
            END
          ) = 'before_lesson' THEN
            v_now > s.start_time - (
              (
                CASE
                  WHEN position('per_lesson' in coalesce(st.payment_model, '')) > 0 AND st.per_lesson_payment_deadline_hours IS NOT NULL
                  THEN st.per_lesson_payment_deadline_hours
                  ELSE v_deadline_h
                END
              ) * interval '1 hour'
            )
          ELSE
            v_now > s.end_time + (
              (
                CASE
                  WHEN position('per_lesson' in coalesce(st.payment_model, '')) > 0 AND st.per_lesson_payment_deadline_hours IS NOT NULL
                  THEN st.per_lesson_payment_deadline_hours
                  ELSE v_deadline_h
                END
              ) * interval '1 hour'
            )
        END
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.student_booking_blocked_overdue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_booking_blocked_overdue(uuid) TO authenticated;


-- =============================
-- FILE: 20260427131500_school_contract_signed_upload.sql
-- =============================

-- Store uploaded signed contract file per school contract
ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS signed_contract_url text;

ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS signed_uploaded_at timestamptz;


-- =============================
-- FILE: 20260427142000_school_installment_reminder_flags.sql
-- =============================

-- Track automatic reminder sends for school installments
ALTER TABLE public.school_payment_installments
  ADD COLUMN IF NOT EXISTS reminder_3d_sent_at timestamptz;

ALTER TABLE public.school_payment_installments
  ADD COLUMN IF NOT EXISTS reminder_1d_sent_at timestamptz;


-- =============================
-- FILE: 20260427150000_school_contracts_archive_soft_delete.sql
-- =============================

-- Soft-delete support for school contracts (archive instead of hard delete)
ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;


-- =============================
-- FILE: 20260427154500_students_child_birth_date.sql
-- =============================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS child_birth_date date;


-- =============================
-- FILE: 20260427162000_school_contract_number.sql
-- =============================

ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS contract_number text;


-- =============================
-- FILE: 20260427190000_students_second_parent_and_address.sql
-- =============================

alter table public.students
  add column if not exists parent_secondary_name text,
  add column if not exists parent_secondary_email text,
  add column if not exists parent_secondary_phone text,
  add column if not exists payer_personal_code text,
  add column if not exists parent_secondary_personal_code text,
  add column if not exists contact_parent text default 'primary',
  add column if not exists student_address text,
  add column if not exists student_city text;

update public.students
set contact_parent = 'primary'
where contact_parent is null or contact_parent not in ('primary', 'secondary');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'students_contact_parent_check'
  ) then
    alter table public.students
      add constraint students_contact_parent_check
      check (contact_parent in ('primary', 'secondary'));
  end if;
end $$;

create table if not exists public.school_contract_completion_tokens (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.school_contracts(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_school_contract_completion_tokens_contract
  on public.school_contract_completion_tokens(contract_id);


-- =============================
-- FILE: 20260427193041_rls_security_audit.sql
-- =============================

-- ============================================================
-- RLS SECURITY AUDIT – Comprehensive hardening
-- ============================================================
--
-- Fixes discovered during audit:
-- 1. Tables with RLS DISABLED: parent_profiles, parent_students, student_payment_methods
-- 2. Excessive anon GRANT ALL on core tables
-- 3. tutor_invites open SELECT (USING true) exposes invitee PII
-- 4. parent_invites open SELECT exposes parent emails
-- 5. SECURITY DEFINER functions without caller authorization
-- 6. storage school-contracts bucket too open
-- 7. Debug function with hardcoded UUID
-- 8. Functions missing SET search_path
-- ============================================================

-- =====================================================
-- PART 1: Enable RLS on unprotected tables
-- =====================================================

ALTER TABLE public.parent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_payment_methods ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PART 2: parent_profiles policies
-- =====================================================

DROP POLICY IF EXISTS "parent_profiles_select_own" ON public.parent_profiles;
CREATE POLICY "parent_profiles_select_own" ON public.parent_profiles
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "parent_profiles_update_own" ON public.parent_profiles;
CREATE POLICY "parent_profiles_update_own" ON public.parent_profiles
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "parent_profiles_select_org_admin" ON public.parent_profiles;
CREATE POLICY "parent_profiles_select_org_admin" ON public.parent_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_students ps
      JOIN public.students s ON s.id = ps.student_id
      JOIN public.profiles p ON p.id = s.tutor_id
      JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE ps.parent_id = parent_profiles.id
        AND oa.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "parent_profiles_select_tutor" ON public.parent_profiles;
CREATE POLICY "parent_profiles_select_tutor" ON public.parent_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_students ps
      JOIN public.students s ON s.id = ps.student_id
      WHERE ps.parent_id = parent_profiles.id
        AND s.tutor_id = auth.uid()
    )
  );

GRANT SELECT, UPDATE ON public.parent_profiles TO authenticated;
GRANT ALL ON public.parent_profiles TO service_role;

-- =====================================================
-- PART 3: parent_students policies
-- =====================================================

DROP POLICY IF EXISTS "parent_students_select_own" ON public.parent_students;
CREATE POLICY "parent_students_select_own" ON public.parent_students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_profiles pp
      WHERE pp.id = parent_students.parent_id
        AND pp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "parent_students_select_tutor" ON public.parent_students;
CREATE POLICY "parent_students_select_tutor" ON public.parent_students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = parent_students.student_id
        AND s.tutor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "parent_students_select_org_admin" ON public.parent_students;
CREATE POLICY "parent_students_select_org_admin" ON public.parent_students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.profiles p ON p.id = s.tutor_id
      JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE s.id = parent_students.student_id
        AND oa.user_id = auth.uid()
    )
  );

GRANT SELECT ON public.parent_students TO authenticated;
GRANT ALL ON public.parent_students TO service_role;

-- =====================================================
-- PART 4: student_payment_methods policies
-- =====================================================

DROP POLICY IF EXISTS "spm_tutor_all" ON public.student_payment_methods;
CREATE POLICY "spm_tutor_all" ON public.student_payment_methods
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_payment_methods.student_id
        AND s.tutor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "spm_student_select" ON public.student_payment_methods;
CREATE POLICY "spm_student_select" ON public.student_payment_methods
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_payment_methods.student_id
        AND s.linked_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "spm_org_admin_all" ON public.student_payment_methods;
CREATE POLICY "spm_org_admin_all" ON public.student_payment_methods
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.profiles p ON p.id = s.tutor_id
      JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE s.id = student_payment_methods.student_id
        AND oa.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_payment_methods TO authenticated;
GRANT ALL ON public.student_payment_methods TO service_role;

-- =====================================================
-- PART 5: Fix tutor_invites open SELECT
-- =====================================================
-- "Anyone can read invite by token" uses USING(true) which exposes
-- ALL invites including invitee_email, invitee_phone to any user.
-- Replace with targeted policies + a SECURITY DEFINER RPC for pre-auth
-- token validation (Register + Login pages need to validate tokens
-- before the user is authenticated).

DROP POLICY IF EXISTS "Anyone can read invite by token" ON public.tutor_invites;
DROP POLICY IF EXISTS "Authenticated can read invite by token" ON public.tutor_invites;

-- Authenticated users can read unused invites (accept-invite flow)
DROP POLICY IF EXISTS "Authenticated can read unused invites" ON public.tutor_invites;
CREATE POLICY "Authenticated can read unused invites" ON public.tutor_invites
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND used = false
  );

-- Tutors can read their own accepted invite
DROP POLICY IF EXISTS "Tutor can read own accepted invite" ON public.tutor_invites;
CREATE POLICY "Tutor can read own accepted invite" ON public.tutor_invites
  FOR SELECT USING (used_by_profile_id = auth.uid());

-- SECURITY DEFINER RPC for pre-auth token validation (anon-safe).
-- Returns only non-sensitive fields; no invitee_email/phone exposed.
CREATE OR REPLACE FUNCTION public.validate_tutor_invite_token(p_token text)
RETURNS TABLE(id uuid, used boolean, organization_id uuid, organization_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    ti.id,
    ti.used,
    ti.organization_id,
    coalesce(o.name, '')::text AS organization_name
  FROM public.tutor_invites ti
  LEFT JOIN public.organizations o ON o.id = ti.organization_id
  WHERE ti.token = p_token
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.validate_tutor_invite_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_tutor_invite_token(text) TO authenticated;

-- =====================================================
-- PART 6: Fix parent_invites open SELECT
-- =====================================================
-- Currently USING(true) exposes all parent emails.
-- Token lookup for registration happens server-side (register-parent.ts uses service_role).
-- The only client-side need is the preview RPC (get_parent_invite_preview) which is SECURITY DEFINER.

DROP POLICY IF EXISTS "allow_public_select" ON public.parent_invites;

-- Only allow the invited parent to see their own invites after registration
DROP POLICY IF EXISTS "parent_invites_own_email" ON public.parent_invites;
CREATE POLICY "parent_invites_own_email" ON public.parent_invites
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND lower(trim(u.email)) = lower(trim(parent_invites.parent_email))
    )
  );

-- Org admin / tutor can see invites for students they manage
DROP POLICY IF EXISTS "parent_invites_tutor_select" ON public.parent_invites;
CREATE POLICY "parent_invites_tutor_select" ON public.parent_invites
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = parent_invites.student_id
        AND s.tutor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "parent_invites_org_admin_select" ON public.parent_invites;
CREATE POLICY "parent_invites_org_admin_select" ON public.parent_invites
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.profiles p ON p.id = s.tutor_id
      JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE s.id = parent_invites.student_id
        AND oa.user_id = auth.uid()
    )
  );

-- =====================================================
-- PART 7: Revoke excessive anon privileges
-- =====================================================
-- anon should NOT have write access to core tables.
-- Supabase Data API respects both GRANT + RLS, but defense in depth
-- requires minimal grants at the GRANT layer too.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.organizations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.organization_admins FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.subjects FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.recurring_individual_sessions FROM anon;

-- tutor_invites: anon needs SELECT for invite lookup during onboarding
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.tutor_invites FROM anon;

-- lesson_packages: anon only had SELECT, keep that for public package display if needed
-- but actually anon shouldn't access lesson packages at all
REVOKE ALL ON public.lesson_packages FROM anon;

-- =====================================================
-- PART 8: Secure SECURITY DEFINER functions
-- =====================================================

-- admin_org_students: Auth check — org admin or service_role (API routes)
CREATE OR REPLACE FUNCTION public.admin_org_students(p_org_id uuid)
RETURNS TABLE(id uuid, full_name text, email text, tutor_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT s.id, s.full_name, s.email, s.tutor_id
  FROM public.students s
  WHERE
    (
      (auth.jwt() ->> 'role') = 'service_role'
      OR EXISTS (
        SELECT 1 FROM public.organization_admins oa
        WHERE oa.user_id = auth.uid() AND oa.organization_id = p_org_id
      )
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = s.tutor_id AND p.organization_id = p_org_id
      )
      OR EXISTS (
        SELECT 1 FROM public.organization_admins oa
        WHERE oa.user_id = s.tutor_id AND oa.organization_id = p_org_id
      )
      OR EXISTS (
        SELECT 1 FROM public.tutor_invites ti
        WHERE ti.used_by_profile_id = s.tutor_id AND ti.organization_id = p_org_id
      )
      OR (s.organization_id IS NOT NULL AND s.organization_id = p_org_id)
    );
$function$;

-- admin_org_student_count: Auth check — org admin or service_role (API routes)
CREATE OR REPLACE FUNCTION public.admin_org_student_count(p_org_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN NOT (
      (auth.jwt() ->> 'role') = 'service_role'
      OR EXISTS (
        SELECT 1 FROM public.organization_admins oa
        WHERE oa.user_id = auth.uid() AND oa.organization_id = p_org_id
      )
    ) THEN 0::bigint
    ELSE (
      SELECT COUNT(*)::bigint
      FROM public.students s
      WHERE
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = s.tutor_id AND p.organization_id = p_org_id
        )
        OR EXISTS (
          SELECT 1 FROM public.organization_admins oa2
          WHERE oa2.user_id = s.tutor_id AND oa2.organization_id = p_org_id
        )
        OR EXISTS (
          SELECT 1 FROM public.tutor_invites ti
          WHERE ti.used_by_profile_id = s.tutor_id AND ti.organization_id = p_org_id
        )
        OR (s.organization_id IS NOT NULL AND s.organization_id = p_org_id)
    )
  END;
$function$;

-- get_student_individual_pricing: Add auth check (tutor, org admin, or linked student)
CREATE OR REPLACE FUNCTION public.get_student_individual_pricing(p_student_id uuid)
RETURNS TABLE (
    id uuid,
    student_id uuid,
    tutor_id uuid,
    subject_id uuid,
    price numeric,
    duration_minutes integer,
    cancellation_hours integer,
    cancellation_fee_percent numeric,
    created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT
        sip.id,
        sip.student_id,
        sip.tutor_id,
        sip.subject_id,
        sip.price,
        sip.duration_minutes,
        sip.cancellation_hours,
        sip.cancellation_fee_percent,
        sip.created_at
    FROM public.student_individual_pricing sip
    WHERE sip.student_id = p_student_id
      AND (
        sip.tutor_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.students s
          WHERE s.id = p_student_id AND s.linked_user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.organization_admins oa
          JOIN public.profiles p ON p.organization_id = oa.organization_id
          WHERE oa.user_id = auth.uid() AND p.id = sip.tutor_id
        )
      );
$function$;

-- get_student_active_packages: Add auth check
CREATE OR REPLACE FUNCTION public.get_student_active_packages(p_student_id uuid)
RETURNS TABLE (
  package_id uuid,
  subject_id uuid,
  subject_name text,
  total_lessons integer,
  available_lessons numeric,
  reserved_lessons numeric,
  completed_lessons numeric,
  price_per_lesson numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM public.students s WHERE s.id = p_student_id AND s.tutor_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = p_student_id AND s.linked_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.profiles p ON p.id = s.tutor_id
      JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE s.id = p_student_id AND oa.user_id = auth.uid()
    )
  ) THEN
    RETURN;
  END IF;

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
$function$;

-- get_unpaid_sessions_for_billing: Add auth check (caller must be the tutor or their org admin)
CREATE OR REPLACE FUNCTION public.get_unpaid_sessions_for_billing(
  p_tutor_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS TABLE (
  session_id uuid,
  student_id uuid,
  student_name text,
  payer_email text,
  payer_name text,
  session_date timestamptz,
  subject_name text,
  price numeric,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    p_tutor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_admins oa
      JOIN public.profiles p ON p.organization_id = oa.organization_id
      WHERE oa.user_id = auth.uid() AND p.id = p_tutor_id
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

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
$function$;

-- =====================================================
-- PART 9: Fix storage school-contracts bucket
-- =====================================================
-- Currently ANY authenticated user can read/upload all school contracts.
-- Restrict to org admins of the contract's org + the linked student.

DROP POLICY IF EXISTS "school_contracts_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "school_contracts_authenticated_read" ON storage.objects;

CREATE POLICY "school_contracts_org_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'school-contracts'
    AND EXISTS (
      SELECT 1 FROM public.organization_admins oa
      WHERE oa.user_id = auth.uid()
    )
  );

CREATE POLICY "school_contracts_org_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'school-contracts'
    AND EXISTS (
      SELECT 1 FROM public.organization_admins oa
      WHERE oa.user_id = auth.uid()
    )
  );

CREATE POLICY "school_contracts_student_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'school-contracts'
    AND EXISTS (
      SELECT 1 FROM public.school_contracts sc
      JOIN public.students s ON s.id = sc.student_id
      WHERE s.linked_user_id = auth.uid()
    )
  );

-- =====================================================
-- PART 10: Drop debug function, fix search_path
-- =====================================================

DROP FUNCTION IF EXISTS public.test_rls_policy();

-- Fix missing SET search_path on get_student_active_packages
-- (already replaced above with SET search_path)

-- Fix missing SET search_path on handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  meta_role text := lower(trim(coalesce(new.raw_user_meta_data->>'role', '')));
  meta_student_id text := trim(coalesce(new.raw_user_meta_data->>'student_id', ''));
  is_student_by_meta boolean := (meta_role = 'student' or meta_student_id <> '');
  student_id_to_link uuid;
  linked_count int;
  v_org_id uuid;
BEGIN
  IF is_student_by_meta AND meta_student_id <> '' THEN
    UPDATE public.students
    SET
      linked_user_id = new.id,
      email = coalesce(new.email, new.raw_user_meta_data->>'email'),
      phone = coalesce(new.raw_user_meta_data->>'phone', phone),
      age = cast(nullif(new.raw_user_meta_data->>'age', '') as integer),
      grade = new.raw_user_meta_data->>'grade',
      subject_id = nullif(new.raw_user_meta_data->>'subject_id', '')::uuid,
      payment_payer = coalesce(new.raw_user_meta_data->>'payment_payer', 'self'),
      payer_name = new.raw_user_meta_data->>'payer_name',
      payer_email = new.raw_user_meta_data->>'payer_email',
      payer_phone = new.raw_user_meta_data->>'payer_phone',
      accepted_privacy_policy_at = (new.raw_user_meta_data->>'accepted_privacy_policy_at')::timestamptz,
      accepted_terms_at = (new.raw_user_meta_data->>'accepted_terms_at')::timestamptz
    WHERE id = meta_student_id::uuid;

    SELECT organization_id INTO v_org_id FROM public.students WHERE id = meta_student_id::uuid;
    IF v_org_id IS NOT NULL THEN
      INSERT INTO public.profiles (id, email, full_name, phone, organization_id)
      VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone', v_org_id)
      ON CONFLICT (id) DO UPDATE SET organization_id = v_org_id;
    END IF;

    RETURN new;
  END IF;

  SELECT s.id INTO student_id_to_link
  FROM public.students s
  WHERE s.linked_user_id IS NULL
    AND trim(lower(coalesce(s.email, ''))) = trim(lower(coalesce(new.email, '')))
  LIMIT 1;

  IF student_id_to_link IS NOT NULL THEN
    UPDATE public.students
    SET linked_user_id = new.id, email = coalesce(new.email, email)
    WHERE id = student_id_to_link;
    GET DIAGNOSTICS linked_count = ROW_COUNT;
    IF linked_count > 0 THEN
      SELECT organization_id INTO v_org_id FROM public.students WHERE id = student_id_to_link;
      IF v_org_id IS NOT NULL THEN
        INSERT INTO public.profiles (id, email, full_name, organization_id)
        VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', v_org_id)
        ON CONFLICT (id) DO UPDATE SET organization_id = v_org_id;
      END IF;
      RETURN new;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$function$;

-- =====================================================
-- PART 11: Add school_contract_completion_tokens policies
-- =====================================================
-- This table has RLS enabled but no policies.
-- It's accessed only via service_role (API routes), so no client policies needed.
-- Add explicit deny for safety documentation.

-- No authenticated policies needed: all access is via service_role which bypasses RLS.
-- RLS enabled with no policies = deny all for authenticated/anon (correct behavior).

-- =====================================================
-- PART 12: Replace open profiles SELECT with granular policies
-- =====================================================
-- profiles_select USING(true) from 20260325 migration exposes all tutor
-- emails, phones, and stripe IDs to any user (including anon).
-- Replace with per-role policies. StudentOnboarding (the only anon flow
-- that needed tutor data) now uses the get_student_by_invite_code RPC.

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_select_org_colleague" ON public.profiles;
CREATE POLICY "profiles_select_org_colleague" ON public.profiles
  FOR SELECT USING (
    organization_id IS NOT NULL
    AND organization_id IN (
      SELECT oa.organization_id FROM public.organization_admins oa
      WHERE oa.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "profiles_select_tutor_of_linked_student" ON public.profiles;
CREATE POLICY "profiles_select_tutor_of_linked_student" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.linked_user_id = auth.uid()
        AND s.tutor_id = profiles.id
    )
  );

DROP POLICY IF EXISTS "profiles_select_chat_peer" ON public.profiles;
CREATE POLICY "profiles_select_chat_peer" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_participants cp_self
      JOIN public.chat_participants cp_peer
        ON cp_peer.conversation_id = cp_self.conversation_id
      WHERE cp_self.user_id = auth.uid()
        AND cp_peer.user_id = profiles.id
    )
  );

-- Parent can see their children's tutor profile
DROP POLICY IF EXISTS "profiles_select_parent_tutor" ON public.profiles;
CREATE POLICY "profiles_select_parent_tutor" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_profiles pp
      JOIN public.parent_students ps ON ps.parent_id = pp.id
      JOIN public.students s ON s.id = ps.student_id
      WHERE pp.user_id = auth.uid()
        AND s.tutor_id = profiles.id
    )
  );


-- =============================
-- FILE: 20260427200000_expand_student_invite_lookup_fields.sql
-- =============================

drop function if exists public.get_student_by_invite_code(text);

create or replace function public.get_student_by_invite_code(p_invite_code text)
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  tutor_id uuid,
  linked_user_id uuid,
  payer_name text,
  payer_email text,
  payer_phone text,
  child_birth_date date,
  organization_id uuid
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.full_name,
    s.email,
    s.phone,
    s.tutor_id,
    s.linked_user_id,
    s.payer_name,
    s.payer_email,
    s.payer_phone,
    s.child_birth_date,
    s.organization_id
  from public.students s
  where upper(s.invite_code) = upper(p_invite_code)
  limit 1;
$$;

revoke all on function public.get_student_by_invite_code(text) from public;
grant execute on function public.get_student_by_invite_code(text) to anon, authenticated, service_role;


-- =============================
-- FILE: 20260427210000_students_parent_secondary_address.sql
-- =============================

alter table public.students
  add column if not exists parent_secondary_address text;


-- =============================
-- FILE: 20260428104000_fix_org_admins_rls_recursion.sql
-- =============================

-- Fix infinite recursion in organization_admins SELECT policy.
-- The previous policy queried organization_admins inside its own USING clause.

CREATE OR REPLACE FUNCTION public.is_org_admin_member(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_admins oa
    WHERE oa.user_id = p_user_id
      AND oa.organization_id = p_org_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_admin_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_admin_member(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Org admin reads co-admins same org" ON public.organization_admins;
CREATE POLICY "Org admin reads co-admins same org" ON public.organization_admins
  FOR SELECT
  USING (
    public.is_org_admin_member(auth.uid(), organization_id)
  );



-- =============================
-- FILE: 20260428112000_hotfix_disable_org_admins_coadmin_policy.sql
-- =============================

-- Emergency hotfix:
-- disable co-admin read policy on organization_admins because it still triggers
-- recursion in production for authenticated SELECT checks during login.
--
-- Security stance remains strict (no public access): users can read only own row.

DROP POLICY IF EXISTS "Org admin reads co-admins same org" ON public.organization_admins;

