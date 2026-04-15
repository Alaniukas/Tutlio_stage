-- Rankiniu būdu apmokėti paketai: susieti su išrašyta pardavimo SF (vengti dubliavimo)
ALTER TABLE public.lesson_packages
  ADD COLUMN IF NOT EXISTS manual_sales_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lesson_packages_manual_sf_pending
  ON public.lesson_packages (tutor_id, paid_at)
  WHERE paid = true AND payment_method = 'manual' AND manual_sales_invoice_id IS NULL;

COMMENT ON COLUMN public.lesson_packages.manual_sales_invoice_id IS
  'Kai org naudoja rankinį mokėjimą: pardavimo SF, kurioje įtrauktas šis paketas (vienkartinė eilutė).';
