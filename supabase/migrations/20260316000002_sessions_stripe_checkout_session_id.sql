-- Store Stripe Checkout session id on sessions so we can reconcile payments and avoid duplicate confirm calls.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;
