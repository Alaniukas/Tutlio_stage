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
