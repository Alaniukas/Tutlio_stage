-- Break RLS recursion between invoices_parent_select and invoice_line_items_parent_select:
-- invoices policy scanned invoice_line_items (with RLS), whose policy referenced invoices again.
-- Use one SECURITY DEFINER helper with row_security off for the visibility graph.

CREATE OR REPLACE FUNCTION public.parent_can_view_sales_invoice(p_invoice_id uuid)
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
      INNER JOIN public.parent_students ps ON ps.student_id = sess.student_id
      INNER JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
      WHERE ili.invoice_id = p_invoice_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.lesson_packages lp
      INNER JOIN public.parent_students ps ON ps.student_id = lp.student_id
      INNER JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
      WHERE lp.manual_sales_invoice_id = p_invoice_id
    );
$$;

REVOKE ALL ON FUNCTION public.parent_can_view_sales_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parent_can_view_sales_invoice(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "invoices_parent_select" ON public.invoices;
CREATE POLICY "invoices_parent_select" ON public.invoices
FOR SELECT
USING (public.parent_can_view_sales_invoice(invoices.id));

DROP POLICY IF EXISTS "invoice_line_items_parent_select" ON public.invoice_line_items;
CREATE POLICY "invoice_line_items_parent_select" ON public.invoice_line_items
FOR SELECT
USING (public.parent_can_view_sales_invoice(invoice_line_items.invoice_id));

DROP POLICY IF EXISTS "Parents read invoice PDFs" ON storage.objects;
CREATE POLICY "Parents read invoice PDFs" ON storage.objects
FOR SELECT
USING (
  bucket_id = 'invoices'
  AND EXISTS (
    SELECT 1
    FROM public.invoices inv
    WHERE inv.pdf_storage_path IS NOT NULL
      AND inv.pdf_storage_path = storage.objects.name
      AND public.parent_can_view_sales_invoice(inv.id)
  )
);
