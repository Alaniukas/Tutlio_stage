-- B2C commission invoices (sąskaitos faktūros klientams)
-- Extends platform_invoices so MB Tutlio can issue per-counterparty monthly
-- invoices for intermediation fees already deducted from payouts:
--  * invoice_type: 'b2b' (agency subscription) | 'b2c_commission' (fees)
--  * tutor_id: counterparty for individual tutors (organization_id stays for agencies)
--  * separate invoice number sequence for the B2C series

-- ── 1. platform_invoices: generic counterparty ────────────────────────
ALTER TABLE public.platform_invoices
  ALTER COLUMN organization_id DROP NOT NULL;

ALTER TABLE public.platform_invoices
  ADD COLUMN IF NOT EXISTS tutor_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'b2b'
    CHECK (invoice_type IN ('b2b', 'b2c_commission'));

ALTER TABLE public.platform_invoices
  DROP CONSTRAINT IF EXISTS platform_invoices_organization_id_period_start_key;

ALTER TABLE public.platform_invoices
  DROP CONSTRAINT IF EXISTS platform_invoices_counterparty_check;
ALTER TABLE public.platform_invoices
  ADD CONSTRAINT platform_invoices_counterparty_check
    CHECK (organization_id IS NOT NULL OR tutor_id IS NOT NULL);

-- One invoice per type + counterparty + month (replaces the old org/month key).
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_invoices_type_org_period
  ON public.platform_invoices(invoice_type, organization_id, period_start)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_invoices_type_tutor_period
  ON public.platform_invoices(invoice_type, tutor_id, period_start)
  WHERE tutor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_invoices_tutor
  ON public.platform_invoices(tutor_id, period_start)
  WHERE tutor_id IS NOT NULL;

-- Tutors can read their own commission invoices (org admins already can).
DROP POLICY IF EXISTS "Tutor can read own platform invoices" ON public.platform_invoices;
CREATE POLICY "Tutor can read own platform invoices" ON public.platform_invoices
  FOR SELECT USING (tutor_id = auth.uid());

COMMENT ON TABLE public.platform_invoices IS
  'Invoices issued by MB Tutlio: b2b = monthly agency subscription + payout fees; b2c_commission = monthly intermediation fees per tutor/agency (already deducted, issued for tax declaration).';

-- ── 2. Separate number sequence for the B2C series (TUT-B2C-00001) ────
CREATE SEQUENCE IF NOT EXISTS public.b2c_invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION public.next_b2c_invoice_number()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT nextval('public.b2c_invoice_number_seq');
$$;

REVOKE EXECUTE ON FUNCTION public.next_b2c_invoice_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_b2c_invoice_number() TO service_role;
