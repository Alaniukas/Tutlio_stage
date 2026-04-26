-- A5: Invoice issuer mode for organizations
-- Determines who issues invoices: the company, the tutor, or both
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS invoice_issuer_mode text NOT NULL DEFAULT 'both'
    CHECK (invoice_issuer_mode IN ('company', 'tutor', 'both'));
