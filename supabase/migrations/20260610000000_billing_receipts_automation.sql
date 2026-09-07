-- Billing & Receipts Automation
-- 1. platform_fee_ledger: persists the platform fee collected from payers per Stripe transaction
--    (Perlas fees are already tracked in perlas_ledger).
-- 2. payout_fee_records: records the per-entity bank transfer fee applied at SEPA XML generation.
-- 3. platform_invoices: monthly B2B invoices issued by MB Tutlio to agencies.
-- 4. organizations.platform_monthly_fee_eur: per-agency platform subscription price.

-- ── 1. platform_fee_ledger ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_fee_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('session', 'package', 'billing_batch', 'penalty')),
  source_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'stripe' CHECK (provider IN ('stripe', 'perlas')),
  organization_id uuid REFERENCES public.organizations(id),
  tutor_id uuid REFERENCES public.profiles(id),
  base_amount numeric(10,2) NOT NULL DEFAULT 0,
  platform_fee numeric(10,2) NOT NULL DEFAULT 0,
  gross_amount numeric(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  stripe_checkout_session_id text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_fee_ledger_paid_at
  ON public.platform_fee_ledger(paid_at);

ALTER TABLE public.platform_fee_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access platform_fee_ledger" ON public.platform_fee_ledger;
CREATE POLICY "Service role full access platform_fee_ledger" ON public.platform_fee_ledger
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  );

COMMENT ON TABLE public.platform_fee_ledger IS
  'Platform administration fee collected from the payer per paid Stripe transaction (B2C income source for accounting).';

-- ── 2. payout_fee_records ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payout_fee_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('tutor', 'org')),
  entity_id uuid NOT NULL,
  batch_id uuid REFERENCES public.payout_batches(id),
  fee_amount numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_fee_records_entity
  ON public.payout_fee_records(entity_type, entity_id, created_at);

ALTER TABLE public.payout_fee_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access payout_fee_records" ON public.payout_fee_records;
CREATE POLICY "Service role full access payout_fee_records" ON public.payout_fee_records
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  );

COMMENT ON TABLE public.payout_fee_records IS
  'Bank transfer (payout) fee deducted from each entity per SEPA payout batch; invoiced as an already-paid line on B2B invoices.';

-- ── 3. platform_invoices ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  deducted_amount numeric(10,2) NOT NULL DEFAULT 0,
  amount_due numeric(10,2) NOT NULL DEFAULT 0,
  pdf_storage_path text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_platform_invoices_org
  ON public.platform_invoices(organization_id, period_start);

ALTER TABLE public.platform_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admin can read own platform invoices" ON public.platform_invoices;
CREATE POLICY "Org admin can read own platform invoices" ON public.platform_invoices
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role full access platform_invoices" ON public.platform_invoices;
CREATE POLICY "Service role full access platform_invoices" ON public.platform_invoices
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  );

COMMENT ON TABLE public.platform_invoices IS
  'Monthly B2B invoices issued by MB Tutlio to agencies (platform subscription + payout fees).';

-- Sequential B2B invoice numbering (atomic via sequence).
CREATE SEQUENCE IF NOT EXISTS public.platform_invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION public.next_platform_invoice_number()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT nextval('public.platform_invoice_number_seq');
$$;

REVOKE EXECUTE ON FUNCTION public.next_platform_invoice_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_platform_invoice_number() TO service_role;

-- ── 4. organizations: platform subscription price ────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS platform_monthly_fee_eur numeric(10,2);

COMMENT ON COLUMN public.organizations.platform_monthly_fee_eur IS
  'Monthly platform subscription price invoiced to the agency (NULL = not invoiced).';
