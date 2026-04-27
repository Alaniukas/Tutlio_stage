-- Soft-delete support for school contracts (archive instead of hard delete)
ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
