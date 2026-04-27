-- Store uploaded signed contract file per school contract
ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS signed_contract_url text;

ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS signed_uploaded_at timestamptz;
