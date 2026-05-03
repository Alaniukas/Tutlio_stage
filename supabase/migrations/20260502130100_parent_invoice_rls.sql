-- Parents can read invoices that include their child's sessions (via line item session_ids).

DROP POLICY IF EXISTS "invoices_parent_select" ON public.invoices;
CREATE POLICY "invoices_parent_select" ON public.invoices FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.invoice_line_items ili
    CROSS JOIN LATERAL unnest(COALESCE(ili.session_ids, ARRAY[]::uuid[])) AS sid(session_id)
    INNER JOIN public.sessions sess ON sess.id = sid.session_id
    INNER JOIN public.parent_students ps ON ps.student_id = sess.student_id
    INNER JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
    WHERE ili.invoice_id = invoices.id
  )
);

DROP POLICY IF EXISTS "invoice_line_items_parent_select" ON public.invoice_line_items;
CREATE POLICY "invoice_line_items_parent_select" ON public.invoice_line_items FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM unnest(COALESCE(invoice_line_items.session_ids, ARRAY[]::uuid[])) AS sid(session_id)
    INNER JOIN public.sessions sess ON sess.id = sid.session_id
    INNER JOIN public.parent_students ps ON ps.student_id = sess.student_id
    INNER JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
  )
);
