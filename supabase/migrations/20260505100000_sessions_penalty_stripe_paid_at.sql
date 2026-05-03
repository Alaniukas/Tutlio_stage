-- Idempotent tracking: Stripe late-cancellation penalty checkout completed (do not confuse with full lesson paid).

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS cancellation_penalty_stripe_paid_at timestamptz;

COMMENT ON COLUMN public.sessions.cancellation_penalty_stripe_paid_at IS
  'Set when the vėlyvo atšaukimo bauda Stripe Checkout completes; distinct from lesson paid=true.';
