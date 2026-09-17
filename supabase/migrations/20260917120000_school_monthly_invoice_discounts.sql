-- Laisvi vaikai: reviewed monthly invoices with percentage or fixed discounts.

ALTER TABLE public.student_lesson_discounts
  ALTER COLUMN percent DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS amount_eur numeric(10,2);

ALTER TABLE public.student_lesson_discounts
  DROP CONSTRAINT IF EXISTS student_lesson_discounts_discount_type_check;
ALTER TABLE public.student_lesson_discounts
  ADD CONSTRAINT student_lesson_discounts_discount_type_check
  CHECK (discount_type IN ('percent', 'amount'));

ALTER TABLE public.student_lesson_discounts
  DROP CONSTRAINT IF EXISTS student_lesson_discounts_value_check;
ALTER TABLE public.student_lesson_discounts
  ADD CONSTRAINT student_lesson_discounts_value_check
  CHECK (
    (discount_type = 'percent' AND percent IS NOT NULL AND percent >= 0 AND percent <= 100)
    OR
    (discount_type = 'amount' AND amount_eur IS NOT NULL AND amount_eur >= 0)
  );

ALTER TABLE public.school_monthly_invoices
  ADD COLUMN IF NOT EXISTS subtotal_eur numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount_eur numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_note text;

ALTER TABLE public.school_monthly_invoice_lines
  ADD COLUMN IF NOT EXISTS original_amount_eur numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS discount_value numeric(10,2),
  ADD COLUMN IF NOT EXISTS discount_amount_eur numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_note text,
  ADD COLUMN IF NOT EXISTS session_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.school_monthly_invoice_lines
  DROP CONSTRAINT IF EXISTS school_monthly_invoice_lines_discount_type_check;
ALTER TABLE public.school_monthly_invoice_lines
  ADD CONSTRAINT school_monthly_invoice_lines_discount_type_check
  CHECK (discount_type IS NULL OR discount_type IN ('percent', 'amount'));

COMMENT ON COLUMN public.school_monthly_invoices.subtotal_eur IS
  'Gross amount before discounts, frozen when the invoice is issued.';
COMMENT ON COLUMN public.school_monthly_invoices.discount_amount_eur IS
  'Total discount shown separately from the original amount.';
COMMENT ON COLUMN public.school_monthly_invoice_lines.session_ids IS
  'Every lesson represented by the grouped invoice row.';
