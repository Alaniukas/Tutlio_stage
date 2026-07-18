-- Students (linked accounts) can view their own sales invoices + PDFs in the
-- new "Mokėjimai" portal page. Mirrors parent_can_view_sales_invoice
-- (20260509120100) with the students.linked_user_id join; SECURITY DEFINER +
-- row_security off to avoid the RLS recursion fixed in 20260503140000.

CREATE OR REPLACE FUNCTION public.student_can_view_sales_invoice(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.invoice_line_items ili
      CROSS JOIN LATERAL unnest(COALESCE(ili.session_ids, ARRAY[]::uuid[])) AS sid(session_id)
      INNER JOIN public.sessions sess ON sess.id = sid.session_id
      INNER JOIN public.students st ON st.id = sess.student_id AND st.linked_user_id = auth.uid()
      WHERE ili.invoice_id = p_invoice_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.lesson_packages lp
      INNER JOIN public.students st ON st.id = lp.student_id AND st.linked_user_id = auth.uid()
      WHERE lp.manual_sales_invoice_id = p_invoice_id
    );
$$;

REVOKE ALL ON FUNCTION public.student_can_view_sales_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_can_view_sales_invoice(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "invoices_student_select" ON public.invoices;
CREATE POLICY "invoices_student_select" ON public.invoices
FOR SELECT
USING (public.student_can_view_sales_invoice(invoices.id));

DROP POLICY IF EXISTS "invoice_line_items_student_select" ON public.invoice_line_items;
CREATE POLICY "invoice_line_items_student_select" ON public.invoice_line_items
FOR SELECT
USING (public.student_can_view_sales_invoice(invoice_line_items.invoice_id));

DROP POLICY IF EXISTS "Students read invoice PDFs" ON storage.objects;
CREATE POLICY "Students read invoice PDFs" ON storage.objects
FOR SELECT
USING (
  bucket_id = 'invoices'
  AND EXISTS (
    SELECT 1
    FROM public.invoices inv
    WHERE inv.pdf_storage_path IS NOT NULL
      AND inv.pdf_storage_path = storage.objects.name
      AND public.student_can_view_sales_invoice(inv.id)
  )
);
