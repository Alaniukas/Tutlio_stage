-- ════════════════════════════════════════════════════════════════════════════
-- School contract e-signing (GoSign / Registrų centras)
--
-- Inserts the two-party signing stage between "parent completed data / final PDF
-- generated" (signing_status = 'sent') and "ready for payment" (= 'signed').
--
-- New signing_status flow:
--   draft ─► sent ─► awaiting_school_signature ─► signed_by_school ─► signed
--                     (directorė e-signs)          (parent(s) e-sign)
--
-- 'signed' stays the terminal "both parties signed" state so the existing
-- payment gate (CompanyPayments filters signing_status = 'signed') is unchanged.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Expand the signing_status CHECK ─────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.school_contracts'::regclass
      AND contype = 'c'
      AND conname LIKE '%signing_status%'
  LOOP
    EXECUTE 'ALTER TABLE public.school_contracts DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE public.school_contracts
  ADD CONSTRAINT school_contracts_signing_status_check
  CHECK (signing_status IN ('draft', 'sent', 'awaiting_school_signature', 'signed_by_school', 'signed'));

-- Whether the second parent must also sign (default: only the primary parent).
ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS require_second_parent boolean NOT NULL DEFAULT false;

-- ─── 2. Per-signer signature rows ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.school_contract_signatures (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id                 uuid NOT NULL REFERENCES public.school_contracts(id) ON DELETE CASCADE,
  role                        text NOT NULL
    CHECK (role IN ('school', 'parent_primary', 'parent_secondary')),
  -- Signing order: school (0) signs before parents (1, 2).
  order_index                 int NOT NULL DEFAULT 0,
  signer_name                 text,
  signer_email                text,
  -- Optional: restricts who may sign at GoSign (personal code). Null ⇒ anyone.
  signer_personal_code        text,
  status                      text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'signed', 'canceled', 'error')),
  gosign_transaction_id       text,
  signing_url                 text,
  -- The signed PDF this signer produced (input for the next signer); the final
  -- one is also copied to school_contracts.signed_contract_url.
  signed_pdf_path             text,
  signer_certificate          text,
  signer_certificate_trusted  boolean,
  -- Safe unique link for parents (no account needed). School signs in-app, so
  -- its token stays null.
  token                       text UNIQUE,
  token_expires_at            timestamptz,
  error_message               text,
  signed_at                   timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, role)
);

CREATE INDEX IF NOT EXISTS idx_school_contract_signatures_contract
  ON public.school_contract_signatures(contract_id);
CREATE INDEX IF NOT EXISTS idx_school_contract_signatures_token
  ON public.school_contract_signatures(token) WHERE token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_school_contract_signatures_txn
  ON public.school_contract_signatures(gosign_transaction_id) WHERE gosign_transaction_id IS NOT NULL;

ALTER TABLE public.school_contract_signatures ENABLE ROW LEVEL SECURITY;

-- ─── 3. RLS: org admins only ────────────────────────────────────────────────
-- Parents act through service-role API endpoints that validate the safe-link
-- token server-side, so no public/anon policy is needed here.
-- Drop-if-exists guards keep this migration safe to re-run.
DROP POLICY IF EXISTS "school_signatures_admin_select" ON public.school_contract_signatures;
DROP POLICY IF EXISTS "school_signatures_admin_insert" ON public.school_contract_signatures;
DROP POLICY IF EXISTS "school_signatures_admin_update" ON public.school_contract_signatures;
DROP POLICY IF EXISTS "school_signatures_admin_delete" ON public.school_contract_signatures;

CREATE POLICY "school_signatures_admin_select" ON public.school_contract_signatures FOR SELECT
  USING (
    contract_id IN (
      SELECT id FROM public.school_contracts WHERE public.is_school_admin(organization_id)
    )
  );

CREATE POLICY "school_signatures_admin_insert" ON public.school_contract_signatures FOR INSERT
  WITH CHECK (
    contract_id IN (
      SELECT id FROM public.school_contracts WHERE public.is_school_admin(organization_id)
    )
  );

CREATE POLICY "school_signatures_admin_update" ON public.school_contract_signatures FOR UPDATE
  USING (
    contract_id IN (
      SELECT id FROM public.school_contracts WHERE public.is_school_admin(organization_id)
    )
  )
  WITH CHECK (
    contract_id IN (
      SELECT id FROM public.school_contracts WHERE public.is_school_admin(organization_id)
    )
  );

CREATE POLICY "school_signatures_admin_delete" ON public.school_contract_signatures FOR DELETE
  USING (
    contract_id IN (
      SELECT id FROM public.school_contracts WHERE public.is_school_admin(organization_id)
    )
  );
