-- Track automatic reminder sends for school installments
ALTER TABLE public.school_payment_installments
  ADD COLUMN IF NOT EXISTS reminder_3d_sent_at timestamptz;

ALTER TABLE public.school_payment_installments
  ADD COLUMN IF NOT EXISTS reminder_1d_sent_at timestamptz;
