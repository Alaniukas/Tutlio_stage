-- ════════════════════════════════════════════════════════════════════════════
-- Manual completion of e-sign contract signatures (admin escape hatch).
--
-- When a parent signs outside the Tutlio flow (e.g. in their own Dokobit
-- account) and never uploads the signed PDF back, the contract is stuck in
-- signing_status = 'signed_by_school'. An org admin can now mark the pending
-- parent signature as received — optionally attaching the externally signed
-- PDF (validated as a PAdES incremental update, like the parent upload path).
--
-- These columns record WHO marked it and WHEN, so manually marked signatures
-- stay distinguishable from GoSign ones (gosign_transaction_id present) and
-- from validated Smart-ID uploads (no transaction, no manual mark).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.school_contract_signatures
  ADD COLUMN IF NOT EXISTS manually_marked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manually_marked_at timestamptz;

COMMENT ON COLUMN public.school_contract_signatures.manually_marked_by IS
  'Org admin (auth.users.id) who manually marked this signature as received; null for signatures collected through GoSign / validated Smart-ID upload.';
COMMENT ON COLUMN public.school_contract_signatures.manually_marked_at IS
  'When the signature was manually marked as received by an org admin.';
