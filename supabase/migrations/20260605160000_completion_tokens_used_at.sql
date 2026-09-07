-- Align school_contract_completion_tokens with API: used_at (timestamptz), not legacy `used` boolean.
DO $$
BEGIN
  IF to_regclass('public.school_contract_completion_tokens') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.school_contract_completion_tokens
    ADD COLUMN IF NOT EXISTS used_at timestamptz;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'school_contract_completion_tokens'
      AND column_name = 'used'
  ) THEN
    UPDATE public.school_contract_completion_tokens
    SET used_at = COALESCE(used_at, created_at)
    WHERE used = true AND used_at IS NULL;

    ALTER TABLE public.school_contract_completion_tokens DROP COLUMN used;
  END IF;
END $$;
