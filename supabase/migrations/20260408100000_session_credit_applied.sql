-- Add credit_applied_amount column to track credit used on a session payment
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS credit_applied_amount numeric(10,2) DEFAULT 0;

COMMENT ON COLUMN public.sessions.credit_applied_amount IS 'Amount of student credit applied to reduce the payment for this session';
