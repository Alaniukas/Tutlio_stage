-- lesson_packages status + extras billing groundwork.
--
-- 1. The payment_status CHECK from 20260327000005 only allows
--    ('pending','paid','failed','refunded'), yet api/expire-packages.ts has
--    been writing 'expired' for months — rebuild the constraint (drop by
--    lookup, prod may have drifted) adding 'expired' and 'cancelled'
--    (org admin can now annul a pending package from the student card).
-- 2. cancelled_at / cancelled_by audit columns for annulled packages.
-- 3. extras_period_start marks an "extra lessons" package that bills the
--    previous month's unpackaged lessons (dynamic-pricing month rules); the
--    partial unique index is the double-billing guard for the monthly sweep.

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.lesson_packages'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%payment_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.lesson_packages DROP CONSTRAINT %I', c.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.lesson_packages
  ADD CONSTRAINT lesson_packages_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'expired', 'cancelled'));

ALTER TABLE public.lesson_packages
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS extras_period_start date;

COMMENT ON COLUMN public.lesson_packages.extras_period_start IS
  'Set (to the 1st of the billed month) when this package invoices extra lessons delivered outside any package that month. One non-cancelled extras package per (tutor, student, month).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_packages_extras_period
  ON public.lesson_packages (tutor_id, student_id, extras_period_start)
  WHERE extras_period_start IS NOT NULL AND payment_status <> 'cancelled';
