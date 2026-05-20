-- PerlasFinance Manual Payout Redesign
-- Replaces self-service/auto payouts with admin-driven manual flow:
-- perlas_ledger tracks every incoming payment, admin generates XML batches.

-- ── 1. platform_settings: configurable commission rates ─────────────
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access platform_settings" ON public.platform_settings;
CREATE POLICY "Service role full access platform_settings" ON public.platform_settings
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  );

INSERT INTO public.platform_settings (key, value)
VALUES
  ('perlas_platform_fee_percent', '0'),
  ('perlas_provider_fee_percent', '0'),
  ('perlas_platform_fee_fixed', '0'),
  ('perlas_provider_fee_fixed', '0')
ON CONFLICT (key) DO NOTHING;

-- ── 2. payout_batches: tracks each XML export ──────────────────────
CREATE TABLE IF NOT EXISTS public.payout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid,
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  entry_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'paid', 'cancelled')),
  xml_filename text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.payout_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access payout_batches" ON public.payout_batches;
CREATE POLICY "Service role full access payout_batches" ON public.payout_batches
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  );

-- ── 3. perlas_ledger: records every incoming PerlasFinance payment ──
CREATE TABLE IF NOT EXISTS public.perlas_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('tutor', 'org')),
  entity_id uuid NOT NULL,
  session_id uuid REFERENCES public.sessions(id),
  perlas_transaction_id text,
  volume numeric(10,2) NOT NULL,
  net_amount numeric(10,2) NOT NULL,
  platform_fee numeric(10,2) NOT NULL DEFAULT 0,
  perlas_fee numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reserved', 'paid_out')),
  batch_id uuid REFERENCES public.payout_batches(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_out_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_perlas_ledger_entity
  ON public.perlas_ledger(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_perlas_ledger_status
  ON public.perlas_ledger(status)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_perlas_ledger_batch
  ON public.perlas_ledger(batch_id)
  WHERE batch_id IS NOT NULL;

ALTER TABLE public.perlas_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tutor can read own ledger" ON public.perlas_ledger;
CREATE POLICY "Tutor can read own ledger" ON public.perlas_ledger
  FOR SELECT USING (
    entity_type = 'tutor' AND entity_id = auth.uid()
  );

DROP POLICY IF EXISTS "Org admin can read org ledger" ON public.perlas_ledger;
CREATE POLICY "Org admin can read org ledger" ON public.perlas_ledger
  FOR SELECT USING (
    entity_type = 'org' AND entity_id IN (
      SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role full access perlas_ledger" ON public.perlas_ledger;
CREATE POLICY "Service role full access perlas_ledger" ON public.perlas_ledger
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  );

-- ── 4. Address fields on profiles and organizations ─────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS payout_country text DEFAULT 'LT',
  ADD COLUMN IF NOT EXISTS payout_city text,
  ADD COLUMN IF NOT EXISTS payout_address text,
  ADD COLUMN IF NOT EXISTS payout_postal_code text;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS payout_country text DEFAULT 'LT',
  ADD COLUMN IF NOT EXISTS payout_city text,
  ADD COLUMN IF NOT EXISTS payout_address text,
  ADD COLUMN IF NOT EXISTS payout_postal_code text;

-- ── 5. Replace balance RPC to use perlas_ledger ─────────────────────
CREATE OR REPLACE FUNCTION public.get_perlas_available_balance(
  p_entity_type text,
  p_entity_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN COALESCE((
    SELECT SUM(net_amount)
    FROM public.perlas_ledger
    WHERE entity_type = p_entity_type
      AND entity_id = p_entity_id
      AND status = 'pending'
  ), 0);
END;
$$;

-- ── 6. New RPC: get volume + net breakdown ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_perlas_balance_breakdown(
  p_entity_type text,
  p_entity_id uuid
)
RETURNS TABLE(
  pending_volume numeric,
  pending_net numeric,
  reserved_volume numeric,
  reserved_net numeric,
  total_paid_out_volume numeric,
  total_paid_out_net numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN status = 'pending' THEN volume END), 0) AS pending_volume,
    COALESCE(SUM(CASE WHEN status = 'pending' THEN net_amount END), 0) AS pending_net,
    COALESCE(SUM(CASE WHEN status = 'reserved' THEN volume END), 0) AS reserved_volume,
    COALESCE(SUM(CASE WHEN status = 'reserved' THEN net_amount END), 0) AS reserved_net,
    COALESCE(SUM(CASE WHEN status = 'paid_out' THEN volume END), 0) AS total_paid_out_volume,
    COALESCE(SUM(CASE WHEN status = 'paid_out' THEN net_amount END), 0) AS total_paid_out_net
  FROM public.perlas_ledger
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_perlas_balance_breakdown(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_perlas_balance_breakdown(text, uuid) TO service_role;

-- ── 7. Drop old atomic payout RPC (no longer needed) ────────────────
DROP FUNCTION IF EXISTS public.insert_payout_if_balance_sufficient(text, uuid, numeric, text, text, text, text, text);
