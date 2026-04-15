-- =====================================================
-- Migration: Tutor subscription support
-- =====================================================

-- Add subscription columns to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text CHECK (subscription_status IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid')),
  ADD COLUMN IF NOT EXISTS subscription_plan text CHECK (subscription_plan IN ('monthly', 'yearly')),
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz;

-- Create index for faster subscription lookups
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON public.profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id ON public.profiles(stripe_customer_id);

COMMENT ON COLUMN public.profiles.stripe_customer_id IS 'Stripe customer ID for subscription billing';
COMMENT ON COLUMN public.profiles.stripe_subscription_id IS 'Stripe subscription ID';
COMMENT ON COLUMN public.profiles.subscription_status IS 'Current subscription status (active, trialing, canceled, etc.)';
COMMENT ON COLUMN public.profiles.subscription_plan IS 'Subscription plan type (monthly or yearly)';
COMMENT ON COLUMN public.profiles.subscription_current_period_end IS 'When the current subscription period ends';
