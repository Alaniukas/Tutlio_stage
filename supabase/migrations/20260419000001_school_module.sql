-- ============================================================
-- School Module – Phase 1
-- Contract administration, installment payments, invite-code automation
-- ============================================================

-- ─── 1. SCHOOLS TABLE ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schools (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  email      text NOT NULL,
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  features   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- ─── 2. SCHOOL ADMINS TABLE ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.school_admins (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.school_admins ENABLE ROW LEVEL SECURITY;

-- ─── 3. SCHOOL CONTRACT TEMPLATES TABLE ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.school_contract_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name              text NOT NULL,
  body              text NOT NULL DEFAULT '',
  annual_fee_default numeric(10,2),
  is_default        boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.school_contract_templates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_school_contract_templates_school
  ON public.school_contract_templates(school_id);

-- ─── 4. SCHOOL CONTRACTS TABLE ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.school_contracts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  template_id     uuid REFERENCES public.school_contract_templates(id) ON DELETE SET NULL,
  student_id      uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  filled_body     text NOT NULL DEFAULT '',
  annual_fee      numeric(10,2) NOT NULL,
  signing_status  text NOT NULL DEFAULT 'draft' CHECK (signing_status IN ('draft', 'sent', 'signed')),
  signed_at       timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.school_contracts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_school_contracts_school
  ON public.school_contracts(school_id);
CREATE INDEX IF NOT EXISTS idx_school_contracts_student
  ON public.school_contracts(student_id);

-- ─── 5. SCHOOL PAYMENT INSTALLMENTS TABLE ──────────────────────────────────────

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

-- ─── 6. COLUMN ADDITIONS ───────────────────────────────────────────────────────

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_students_school_id
  ON public.students(school_id) WHERE school_id IS NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_school_id
  ON public.profiles(school_id) WHERE school_id IS NOT NULL;

-- ─── 7. RLS POLICIES ───────────────────────────────────────────────────────────

-- Helper: is current user an admin of the given school?
CREATE OR REPLACE FUNCTION public.is_school_admin(p_school_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_admins
    WHERE user_id = auth.uid() AND school_id = p_school_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_school_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_school_admin(uuid) TO authenticated;

-- ── schools ──────────────────────────────────────────────────────────────────

CREATE POLICY "school_admin_select" ON public.schools FOR SELECT
  USING (public.is_school_admin(id));

CREATE POLICY "school_admin_update" ON public.schools FOR UPDATE
  USING (public.is_school_admin(id))
  WITH CHECK (public.is_school_admin(id));

-- ── school_admins ────────────────────────────────────────────────────────────

CREATE POLICY "school_admin_self_select" ON public.school_admins FOR SELECT
  USING (user_id = auth.uid());

-- ── school_contract_templates ────────────────────────────────────────────────

CREATE POLICY "school_templates_admin_select" ON public.school_contract_templates FOR SELECT
  USING (public.is_school_admin(school_id));

CREATE POLICY "school_templates_admin_insert" ON public.school_contract_templates FOR INSERT
  WITH CHECK (public.is_school_admin(school_id));

CREATE POLICY "school_templates_admin_update" ON public.school_contract_templates FOR UPDATE
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

CREATE POLICY "school_templates_admin_delete" ON public.school_contract_templates FOR DELETE
  USING (public.is_school_admin(school_id));

-- ── school_contracts ─────────────────────────────────────────────────────────

CREATE POLICY "school_contracts_admin_select" ON public.school_contracts FOR SELECT
  USING (public.is_school_admin(school_id));

CREATE POLICY "school_contracts_admin_insert" ON public.school_contracts FOR INSERT
  WITH CHECK (public.is_school_admin(school_id));

CREATE POLICY "school_contracts_admin_update" ON public.school_contracts FOR UPDATE
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

CREATE POLICY "school_contracts_admin_delete" ON public.school_contracts FOR DELETE
  USING (public.is_school_admin(school_id));

CREATE POLICY "school_contracts_student_select" ON public.school_contracts FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE linked_user_id = auth.uid()
    )
  );

-- ── school_payment_installments ──────────────────────────────────────────────

CREATE POLICY "school_installments_admin_select" ON public.school_payment_installments FOR SELECT
  USING (
    contract_id IN (
      SELECT id FROM public.school_contracts WHERE public.is_school_admin(school_id)
    )
  );

CREATE POLICY "school_installments_admin_insert" ON public.school_payment_installments FOR INSERT
  WITH CHECK (
    contract_id IN (
      SELECT id FROM public.school_contracts WHERE public.is_school_admin(school_id)
    )
  );

CREATE POLICY "school_installments_admin_update" ON public.school_payment_installments FOR UPDATE
  USING (
    contract_id IN (
      SELECT id FROM public.school_contracts WHERE public.is_school_admin(school_id)
    )
  )
  WITH CHECK (
    contract_id IN (
      SELECT id FROM public.school_contracts WHERE public.is_school_admin(school_id)
    )
  );

CREATE POLICY "school_installments_admin_delete" ON public.school_payment_installments FOR DELETE
  USING (
    contract_id IN (
      SELECT id FROM public.school_contracts WHERE public.is_school_admin(school_id)
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

-- ── students: school admin CRUD for school students ──────────────────────────

CREATE POLICY "school_admin_view_students" ON public.students FOR SELECT
  USING (school_id IS NOT NULL AND public.is_school_admin(school_id));

CREATE POLICY "school_admin_insert_students" ON public.students FOR INSERT
  WITH CHECK (school_id IS NOT NULL AND public.is_school_admin(school_id));

CREATE POLICY "school_admin_update_students" ON public.students FOR UPDATE
  USING (school_id IS NOT NULL AND public.is_school_admin(school_id))
  WITH CHECK (school_id IS NOT NULL AND public.is_school_admin(school_id));

CREATE POLICY "school_admin_delete_students" ON public.students FOR DELETE
  USING (school_id IS NOT NULL AND public.is_school_admin(school_id));

-- ─── 8. GRANTS ──────────────────────────────────────────────────────────────────

GRANT ALL ON public.schools                      TO service_role, authenticated;
GRANT ALL ON public.school_admins                TO service_role, authenticated;
GRANT ALL ON public.school_contract_templates    TO service_role, authenticated;
GRANT ALL ON public.school_contracts             TO service_role, authenticated;
GRANT ALL ON public.school_payment_installments  TO service_role, authenticated;
