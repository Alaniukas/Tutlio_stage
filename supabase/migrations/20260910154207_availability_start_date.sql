-- Recurring free-time rules: first calendar day the rule applies (inclusive).
-- NULL = effective from created_at day (see availabilityRecurring.ts).
ALTER TABLE public.availability
  ADD COLUMN IF NOT EXISTS start_date date;

COMMENT ON COLUMN public.availability.start_date IS
  'First day (inclusive) when a recurring availability rule applies. NULL = from created_at day.';;
