-- Add payment_method column to lesson_packages for manual (org) vs stripe payments
ALTER TABLE lesson_packages
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'stripe';

COMMENT ON COLUMN public.lesson_packages.payment_method IS 'stripe = Stripe checkout; manual = org hand/off-platform payment, confirmed by org admin';
