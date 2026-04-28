-- Combined prod sync bundle (blocks 00..04 + 20260428112000 hotfix)
-- Generated for debugging prod/main schema drift and org_admin login recursion.


-- ============================================================
-- SOURCE: c:/Users/37062/Desktop/simono_school/supabase/prod_sync_block_00_preflight.sql
-- ============================================================

-- Preflight for missing school contract/installment chain
create table if not exists public.school_contract_templates (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid,
  name               text not null default 'Default template',
  body               text not null default '',
  annual_fee_default numeric(10,2),
  is_default         boolean not null default false,
  created_at         timestamptz not null default now()
);

create table if not exists public.school_contracts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid,
  template_id     uuid,
  student_id      uuid,
  filled_body     text not null default '',
  annual_fee      numeric(10,2) not null default 0,
  signing_status  text not null default 'draft',
  signed_at       timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.school_payment_installments (
  id                         uuid primary key default gen_random_uuid(),
  contract_id                uuid not null,
  installment_number         int not null check (installment_number > 0),
  amount                     numeric(10,2) not null check (amount > 0),
  due_date                   date not null,
  payment_status             text not null default 'pending',
  stripe_payment_intent_id   text,
  stripe_checkout_session_id text,
  paid_at                    timestamptz,
  created_at                 timestamptz not null default now(),
  reminder_3d_sent_at        timestamptz,
  reminder_1d_sent_at        timestamptz
);

create table if not exists public.school_contract_completion_tokens (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null,
  token text not null unique,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_school_contract_templates_org
  on public.school_contract_templates(organization_id);

create index if not exists idx_school_contracts_org
  on public.school_contracts(organization_id);

create index if not exists idx_school_contracts_student
  on public.school_contracts(student_id);

create index if not exists idx_school_installments_contract
  on public.school_payment_installments(contract_id);

create index if not exists idx_school_contract_completion_tokens_contract
  on public.school_contract_completion_tokens(contract_id);

-- ============================================================
-- SOURCE: c:/Users/37062/Desktop/simono_school/supabase/prod_sync_block_01_20260415120000_20260421000001.sql
-- ============================================================

-- PROD sync block 01: 20260415120000..20260421000001


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

-- ============================================================
-- SOURCE: c:/Users/37062/Desktop/simono_school/supabase/prod_sync_block_02_20260424130000_20260426230000.sql
-- ============================================================

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

-- ============================================================
-- SOURCE: c:/Users/37062/Desktop/simono_school/supabase/prod_sync_block_03_20260427123000_20260427193041.sql
-- ============================================================

-- PROD sync block 03: 20260427123000..20260427193041


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

-- ============================================================
-- SOURCE: c:/Users/37062/Desktop/simono_school/supabase/prod_sync_block_04_20260427200000_20260428112000.sql
-- ============================================================

-- PROD sync block 04: 20260427200000..20260428112000


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


-- ============================================================
-- SOURCE: c:/Users/37062/Desktop/simono_school/supabase/migrations/20260428112000_hotfix_disable_org_admins_coadmin_policy.sql
-- ============================================================

-- Emergency hotfix:
-- disable co-admin read policy on organization_admins because it still triggers
-- recursion in production for authenticated SELECT checks during login.
--
-- Security stance remains strict (no public access): users can read only own row.

DROP POLICY IF EXISTS "Org admin reads co-admins same org" ON public.organization_admins;

