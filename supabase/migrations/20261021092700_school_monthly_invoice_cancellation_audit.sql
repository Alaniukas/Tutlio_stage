-- Keep numbered documents and their source lines; cancellation removes only
-- their payable status. Old cancellations predate the optional audit fields.
ALTER TABLE public.school_monthly_invoices
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN cancellation_reason text CHECK (
    cancellation_reason IS NULL OR char_length(btrim(cancellation_reason)) BETWEEN 3 AND 1000
  );
