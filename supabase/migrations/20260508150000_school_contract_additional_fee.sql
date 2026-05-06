DO $$
BEGIN
  IF to_regclass('public.school_contracts') IS NULL THEN
    RAISE NOTICE 'Skipping migration: public.school_contracts does not exist in this database.';
    RETURN;
  END IF;

  ALTER TABLE public.school_contracts
    ADD COLUMN IF NOT EXISTS additional_fee_amount numeric(10,2),
    ADD COLUMN IF NOT EXISTS additional_fee_purpose text;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'school_contracts_additional_fee_amount_nonnegative'
  ) THEN
    ALTER TABLE public.school_contracts
      ADD CONSTRAINT school_contracts_additional_fee_amount_nonnegative
      CHECK (additional_fee_amount IS NULL OR additional_fee_amount >= 0);
  END IF;
END $$;
