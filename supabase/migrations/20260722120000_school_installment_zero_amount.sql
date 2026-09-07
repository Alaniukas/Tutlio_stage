-- Allow zero-EUR school installments (free contracts still use the same payment trigger flow).
ALTER TABLE public.school_payment_installments
  DROP CONSTRAINT IF EXISTS school_payment_installments_amount_check;

ALTER TABLE public.school_payment_installments
  ADD CONSTRAINT school_payment_installments_amount_check
  CHECK (amount >= 0);
