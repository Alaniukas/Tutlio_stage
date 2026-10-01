BEGIN;

-- Retain cancelled invoices for audit, while allowing the admin to issue a replacement.
-- Pending and paid invoices still reserve the student's monthly invoice slot.
DROP INDEX IF EXISTS public.idx_school_monthly_invoices_student_period;
CREATE UNIQUE INDEX idx_school_monthly_invoices_student_period
  ON public.school_monthly_invoices(student_id, period_start)
  WHERE contract_id IS NULL AND payment_status <> 'cancelled';

COMMENT ON INDEX public.idx_school_monthly_invoices_student_period IS
  'One non-cancelled admin monthly invoice per student and period; cancelled history is retained.';

COMMIT;
