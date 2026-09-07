-- PVM education invoices: bank details, PDF extras, external number reservations,
-- and atomic invoice-number allocation.

ALTER TABLE public.invoice_profiles
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS iban TEXT;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS pdf_meta JSONB;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_origin_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_origin_check
  CHECK (origin IN ('generated', 'external'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_org_invoice_number
  ON public.invoices (organization_id, invoice_number)
  WHERE organization_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.allocate_invoice_number(p_profile_id uuid)
RETURNS TABLE(invoice_series text, allocated_number int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.invoice_profiles
  SET
    next_invoice_number = next_invoice_number + 1,
    updated_at = now()
  WHERE id = p_profile_id
  RETURNING invoice_profiles.invoice_series, invoice_profiles.next_invoice_number - 1;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_invoice_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_invoice_number(uuid) TO service_role;

COMMENT ON FUNCTION public.allocate_invoice_number(uuid) IS
  'Atomically allocate the next invoice serial number for an invoice_profiles row.';
