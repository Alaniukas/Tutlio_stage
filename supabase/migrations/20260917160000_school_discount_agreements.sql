-- Parent-approved discount addenda for Laisvi vaikai school contracts.

CREATE TABLE IF NOT EXISTS public.school_discount_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.school_contracts(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  tutor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  agreement_number text NOT NULL UNIQUE,
  activity_label text NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'amount')),
  discount_value numeric(10,2) NOT NULL CHECK (discount_value > 0),
  valid_from date NOT NULL,
  valid_until date NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  recipient_name text,
  recipient_email text NOT NULL,
  acceptance_token_hash text NOT NULL UNIQUE,
  token_expires_at timestamptz NOT NULL,
  sent_at timestamptz,
  email_error text,
  accepted_at timestamptz,
  acceptance_statement text,
  acceptance_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_path text,
  document_sha256 text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_discount_agreements_percent_check CHECK (
    discount_type <> 'percent' OR discount_value <= 100
  ),
  CONSTRAINT school_discount_agreements_period_check CHECK (valid_until >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_school_discount_agreements_student
  ON public.school_discount_agreements (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_discount_agreements_contract
  ON public.school_discount_agreements (contract_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_discount_agreements_status
  ON public.school_discount_agreements (organization_id, status, created_at DESC);

ALTER TABLE public.student_lesson_discounts
  ADD COLUMN IF NOT EXISTS agreement_id uuid
    REFERENCES public.school_discount_agreements(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_lesson_discounts_agreement
  ON public.student_lesson_discounts (agreement_id);

ALTER TABLE public.school_discount_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY school_discount_agreements_admin
  ON public.school_discount_agreements
  FOR ALL
  USING (public.is_school_admin(organization_id))
  WITH CHECK (public.is_school_admin(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_discount_agreements TO authenticated;

COMMENT ON TABLE public.school_discount_agreements IS
  'Parent-approved addenda that activate lesson discounts only after click-wrap acceptance.';
COMMENT ON COLUMN public.school_discount_agreements.pdf_path IS
  'Private school-contracts bucket path of the generated discount addendum.';
COMMENT ON COLUMN public.student_lesson_discounts.agreement_id IS
  'Accepted agreement that authorized this recurring lesson discount.';
