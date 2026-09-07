-- Extra-lessons click-wrap: persist 14-day early-start choice (TAIP/NE/NETAIKOMA)
-- with shown text, chooser account, and withdrawal vs termination.

ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS start_within_14_status text,
  ADD COLUMN IF NOT EXISTS start_within_14_shown_text text,
  ADD COLUMN IF NOT EXISTS start_within_14_chosen_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS extra_end_kind text,
  ADD COLUMN IF NOT EXISTS extra_end_statement_path text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'school_contracts_start_within_14_status_check'
      AND conrelid = 'public.school_contracts'::regclass
  ) THEN
    ALTER TABLE public.school_contracts
      ADD CONSTRAINT school_contracts_start_within_14_status_check
      CHECK (start_within_14_status IS NULL OR start_within_14_status IN ('yes', 'no', 'na'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'school_contracts_extra_end_kind_check'
      AND conrelid = 'public.school_contracts'::regclass
  ) THEN
    ALTER TABLE public.school_contracts
      ADD CONSTRAINT school_contracts_extra_end_kind_check
      CHECK (extra_end_kind IS NULL OR extra_end_kind IN ('withdrawal', 'termination'));
  END IF;
END $$;

COMMENT ON COLUMN public.school_contracts.start_within_14_status IS
  'yes = parent asked to start within 14 days; no = wait until window ends; na = first lesson already after 14 days';
COMMENT ON COLUMN public.school_contracts.start_within_14_shown_text IS
  'Exact checkbox copy shown to the parent (null when status = na)';
COMMENT ON COLUMN public.school_contracts.accepted_by_user_id IS
  'Parent Tutlio auth user who click-wrapped the extra-lessons contract';
COMMENT ON COLUMN public.school_contracts.extra_end_kind IS
  'withdrawal = 14-day distance-contract right; termination = after the window (CK 6.721)';
