-- Monthly extra-lessons invoices are now emailed to the payer with a Stripe
-- "pay now" link (no Tutlio account needed). Track the checkout bookkeeping the
-- same way school_payment_installments does.
ALTER TABLE public.school_monthly_invoices
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS invoice_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_via text;

CREATE INDEX IF NOT EXISTS idx_school_monthly_invoices_student_status
  ON public.school_monthly_invoices(student_id, payment_status);

COMMENT ON COLUMN public.school_monthly_invoices.invoice_email_sent_at IS
  'When the payer got the "Sąskaita už mėnesį" email with the pay link (bill-school-extra-lessons cron).';
COMMENT ON COLUMN public.school_monthly_invoices.paid_via IS
  'stripe (checkout) | manual (school confirmed a transfer)';
