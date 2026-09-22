-- Staff documents are a separate use of the existing school -> counterparty
-- signing chain. NULL for every pre-existing school contract.
ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS staff_document_type text,
  ADD COLUMN IF NOT EXISTS staff_document_group_id uuid,
  ADD COLUMN IF NOT EXISTS staff_employment_contract_number text,
  ADD COLUMN IF NOT EXISTS staff_employment_contract_date date,
  ADD COLUMN IF NOT EXISTS staff_consent_answers jsonb,
  ADD COLUMN IF NOT EXISTS staff_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_last_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_files_deleted_at timestamptz;

ALTER TABLE public.school_contracts
  ADD CONSTRAINT school_contracts_staff_document_type_check
  CHECK (staff_document_type IS NULL OR staff_document_type IN ('confidentiality', 'consent'));

ALTER TABLE public.school_contracts
  ADD CONSTRAINT school_contracts_staff_document_party_check
  CHECK (staff_document_type IS NULL OR party_kind = 'teacher');

CREATE INDEX IF NOT EXISTS idx_school_staff_documents_retention
  ON public.school_contracts(signed_at)
  WHERE staff_document_type IS NOT NULL AND staff_files_deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_school_staff_documents_group
  ON public.school_contracts(organization_id, staff_document_group_id)
  WHERE staff_document_type IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_school_staff_documents_pair_unique
  ON public.school_contracts(organization_id, staff_document_group_id, staff_document_type)
  WHERE staff_document_type IS NOT NULL;
