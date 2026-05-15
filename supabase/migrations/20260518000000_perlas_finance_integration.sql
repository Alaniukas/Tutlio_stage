-- PerlasFinance integration: optional per-entity payment flow
-- Adds columns for PerlasFinance enablement, bank payout details,
-- payouts tracking table, and sessions.perlas_transaction_id.

-- ── 1. profiles: PerlasFinance columns ────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS perlas_finance_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payout_iban text,
  ADD COLUMN IF NOT EXISTS payout_recipient_name text,
  ADD COLUMN IF NOT EXISTS payout_bank_bic text,
  ADD COLUMN IF NOT EXISTS payout_auto_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payout_auto_frequency text CHECK (payout_auto_frequency IS NULL OR payout_auto_frequency IN ('weekly', 'monthly'));

-- ── 2. organizations: same PerlasFinance columns ──────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS perlas_finance_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payout_iban text,
  ADD COLUMN IF NOT EXISTS payout_recipient_name text,
  ADD COLUMN IF NOT EXISTS payout_bank_bic text,
  ADD COLUMN IF NOT EXISTS payout_auto_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payout_auto_frequency text CHECK (payout_auto_frequency IS NULL OR payout_auto_frequency IN ('weekly', 'monthly'));

-- ── 3. sessions: track PerlasFinance-paid lessons ─────────────────────
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS perlas_transaction_id text;

CREATE INDEX IF NOT EXISTS idx_sessions_perlas_tx
  ON public.sessions(perlas_transaction_id)
  WHERE perlas_transaction_id IS NOT NULL;

-- ── 4. payouts table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('tutor', 'org')),
  entity_id uuid NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'success', 'failed')),
  perlas_transaction_id text NOT NULL UNIQUE,
  payment_purpose text NOT NULL,
  receiver_iban text NOT NULL,
  receiver_name text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  failed_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payouts_entity
  ON public.payouts(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status
  ON public.payouts(status)
  WHERE status = 'processing';

-- ── 5. RLS for payouts ────────────────────────────────────────────────
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tutor can read own payouts" ON public.payouts;
CREATE POLICY "Tutor can read own payouts" ON public.payouts
  FOR SELECT USING (
    entity_type = 'tutor' AND entity_id = auth.uid()
  );

DROP POLICY IF EXISTS "Org admin can read org payouts" ON public.payouts;
CREATE POLICY "Org admin can read org payouts" ON public.payouts
  FOR SELECT USING (
    entity_type = 'org' AND entity_id IN (
      SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role full access payouts" ON public.payouts;
CREATE POLICY "Service role full access payouts" ON public.payouts
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  );

-- ── 6. RPC: get PerlasFinance available balance ───────────────────────
CREATE OR REPLACE FUNCTION public.get_perlas_available_balance(
  p_entity_type text,
  p_entity_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_earned numeric;
  v_total_paid_out numeric;
BEGIN
  IF p_entity_type = 'tutor' THEN
    SELECT COALESCE(SUM(s.price), 0) INTO v_total_earned
    FROM public.sessions s
    WHERE s.tutor_id = p_entity_id
      AND s.paid = true
      AND s.perlas_transaction_id IS NOT NULL;
  ELSIF p_entity_type = 'org' THEN
    SELECT COALESCE(SUM(s.price), 0) INTO v_total_earned
    FROM public.sessions s
    JOIN public.profiles p ON p.id = s.tutor_id
    WHERE p.organization_id = p_entity_id
      AND s.paid = true
      AND s.perlas_transaction_id IS NOT NULL;
  ELSE
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid_out
  FROM public.payouts
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND status IN ('processing', 'success');

  RETURN GREATEST(v_total_earned - v_total_paid_out, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_perlas_available_balance(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_perlas_available_balance(text, uuid) TO service_role;
