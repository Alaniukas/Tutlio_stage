BEGIN;

-- Admin actual invoices may add a later S.F. in the same month for still-unbilled
-- sessions (deduped by billed_session_ids). Keep a lookup index, not a unique slot.
DROP INDEX IF EXISTS public.idx_school_monthly_invoices_student_period;
CREATE INDEX idx_school_monthly_invoices_student_period
  ON public.school_monthly_invoices(student_id, period_start)
  WHERE contract_id IS NULL AND payment_status <> 'cancelled';

COMMENT ON INDEX public.idx_school_monthly_invoices_student_period IS
  'Lookup of live admin monthly invoices by student and period; multiple rows are allowed when later sessions were not on the first S.F.';

ALTER TABLE public.school_monthly_invoices
  ADD COLUMN IF NOT EXISTS issuer_note text;

COMMENT ON COLUMN public.school_monthly_invoices.issuer_note IS
  'Payer-facing note on a supplemental or corrected monthly invoice.';

COMMIT;
