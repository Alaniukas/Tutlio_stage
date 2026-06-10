-- Enterprise self-serve license billing
-- Organizations can purchase tutor licenses via Stripe subscription checkout
-- (quantity = license count). The webhook syncs the Stripe subscription quantity
-- into organizations.tutor_license_count, which stays the single value read by UI.
-- Distinct from Stripe Connect payout fields (stripe_account_id).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS license_subscription_id text,
  ADD COLUMN IF NOT EXISTS license_subscription_status text
    CHECK (license_subscription_status IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid')),
  ADD COLUMN IF NOT EXISTS license_subscription_period_end timestamptz;

CREATE INDEX IF NOT EXISTS idx_organizations_license_subscription_id
  ON public.organizations(license_subscription_id)
  WHERE license_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer_id
  ON public.organizations(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN public.organizations.stripe_customer_id IS
  'Stripe customer ID for enterprise license subscription billing (not Connect).';
COMMENT ON COLUMN public.organizations.license_subscription_id IS
  'Stripe subscription ID whose quantity = purchased tutor licenses.';
COMMENT ON COLUMN public.organizations.license_subscription_status IS
  'Stripe license subscription status (active, past_due, canceled, ...).';
COMMENT ON COLUMN public.organizations.license_subscription_period_end IS
  'Current period end of the license subscription.';
