-- Parents: SF from lesson packages (manual_sales_invoice_id) + PDF download in storage.
-- Also: parents can read lesson_packages rows for linked children (invoice list query).
-- Version 20260508120200 (was duplicate 20260508120000 with enable_manual_student_payments).

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
  OR EXISTS (
    SELECT 1
    FROM public.lesson_packages lp
    INNER JOIN public.parent_students ps ON ps.student_id = lp.student_id
    INNER JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
    WHERE lp.manual_sales_invoice_id = invoices.id
  )
);

DROP POLICY IF EXISTS "invoice_line_items_parent_select" ON public.invoice_line_items;
CREATE POLICY "invoice_line_items_parent_select" ON public.invoice_line_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.invoices inv
    WHERE inv.id = invoice_line_items.invoice_id
    AND (
      EXISTS (
        SELECT 1
        FROM public.invoice_line_items ili2
        CROSS JOIN LATERAL unnest(COALESCE(ili2.session_ids, ARRAY[]::uuid[])) AS sid(session_id)
        INNER JOIN public.sessions sess ON sess.id = sid.session_id
        INNER JOIN public.parent_students ps ON ps.student_id = sess.student_id
        INNER JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
        WHERE ili2.invoice_id = inv.id
      )
      OR EXISTS (
        SELECT 1
        FROM public.lesson_packages lp
        INNER JOIN public.parent_students ps ON ps.student_id = lp.student_id
        INNER JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
        WHERE lp.manual_sales_invoice_id = inv.id
      )
    )
  )
);

DROP POLICY IF EXISTS "lesson_packages_parent_select" ON public.lesson_packages;
CREATE POLICY "lesson_packages_parent_select" ON public.lesson_packages FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.parent_students ps
    INNER JOIN public.parent_profiles pp ON pp.id = ps.parent_id
    WHERE ps.student_id = lesson_packages.student_id
      AND pp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Parents read invoice PDFs" ON storage.objects;
CREATE POLICY "Parents read invoice PDFs" ON storage.objects FOR SELECT USING (
  bucket_id = 'invoices'
  AND EXISTS (
    SELECT 1 FROM public.invoices inv
    WHERE inv.pdf_storage_path IS NOT NULL
      AND inv.pdf_storage_path = storage.objects.name
      AND (
        EXISTS (
          SELECT 1
          FROM public.invoice_line_items ili
          CROSS JOIN LATERAL unnest(COALESCE(ili.session_ids, ARRAY[]::uuid[])) AS sid(session_id)
          INNER JOIN public.sessions sess ON sess.id = sid.session_id
          INNER JOIN public.parent_students ps ON ps.student_id = sess.student_id
          INNER JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
          WHERE ili.invoice_id = inv.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.lesson_packages lp
          INNER JOIN public.parent_students ps ON ps.student_id = lp.student_id
          INNER JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
          WHERE lp.manual_sales_invoice_id = inv.id
        )
      )
  )
);
