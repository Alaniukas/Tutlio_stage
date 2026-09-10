ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_commission_by_subject jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.company_commission_by_subject IS
  'Map of subject_id → EUR tutor pay per lesson. Overrides company_commission_percent when set.';;
