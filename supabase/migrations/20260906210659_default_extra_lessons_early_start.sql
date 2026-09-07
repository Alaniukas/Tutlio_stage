-- New and already-sent extra-lessons offers open with the early-start choice selected.
-- Do not rewrite accepted contracts: their stored value is part of the parent's frozen consent record.

ALTER TABLE public.school_contracts
  ALTER COLUMN start_within_14_days SET DEFAULT true;

UPDATE public.school_contracts
SET start_within_14_days = true
WHERE kind = 'extra_lessons'
  AND sent_at IS NOT NULL
  AND accepted_at IS NULL
  AND withdrawal_requested_at IS NULL
  AND start_within_14_days IS DISTINCT FROM true;

COMMENT ON COLUMN public.school_contracts.start_within_14_days IS
  'Parent request to start services within the 14-day withdrawal period; defaults to true for unaccepted offers.';
