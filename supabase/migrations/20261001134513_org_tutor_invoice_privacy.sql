-- Invoice issuer and lesson membership are not authorization to client billing.
-- Tutor remuneration is explicitly identified by pdf_meta.invoiceKind/tutorId.
-- Unmarked/ambiguous invoices remain customer invoices and fail closed for tutors.

WITH candidates AS (
  SELECT DISTINCT i.id, p.id AS tutor_id
  FROM public.invoices i
  JOIN public.organizations o ON o.id = i.organization_id
  JOIN public.profiles p ON p.organization_id = i.organization_id
  LEFT JOIN public.invoice_profiles org_ip ON org_ip.organization_id = o.id
  LEFT JOIN public.invoice_profiles tutor_ip ON tutor_ip.user_id = p.id
  WHERE i.pdf_meta->>'invoiceKind' IS NULL
    AND (i.pdf_meta->>'layout' IS NULL OR i.pdf_meta->>'layout' IN ('classic_lt_tutor', 'school_tutor_meetings'))
    AND i.billing_batch_id IS NULL AND i.source_session_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.lesson_packages lp WHERE lp.manual_sales_invoice_id = i.id)
    -- An organization must be the buyer. Merely billing one of its pupils is insufficient.
    AND CASE
      WHEN NULLIF(BTRIM(i.buyer_snapshot->>'companyCode'), '') IS NOT NULL
        AND NULLIF(BTRIM(org_ip.company_code), '') IS NOT NULL
      THEN BTRIM(i.buyer_snapshot->>'companyCode') = BTRIM(org_ip.company_code)
      ELSE LOWER(REGEXP_REPLACE(BTRIM(COALESCE(i.buyer_snapshot->>'name', '')), '\s+', ' ', 'g'))
        = LOWER(REGEXP_REPLACE(BTRIM(COALESCE(NULLIF(org_ip.business_name, ''), o.name)), '\s+', ' ', 'g'))
    END
    AND (
      i.pdf_meta->>'tutorId' = p.id::text
      OR (
        NOT EXISTS (SELECT 1 FROM public.organization_admins oa WHERE oa.user_id = p.id)
        AND (
          i.issued_by_user_id = p.id
          OR LOWER(REGEXP_REPLACE(BTRIM(COALESCE(i.seller_snapshot->>'name', '')), '\s+', ' ', 'g'))
            = LOWER(REGEXP_REPLACE(BTRIM(COALESCE(NULLIF(tutor_ip.business_name, ''), p.full_name)), '\s+', ' ', 'g'))
        )
      )
    )
), unambiguous AS (
  SELECT id, MIN(tutor_id::text) AS tutor_id FROM candidates GROUP BY id HAVING COUNT(*) = 1
)
UPDATE public.invoices i
SET pdf_meta = COALESCE(i.pdf_meta, '{}'::jsonb)
  || JSONB_BUILD_OBJECT('invoiceKind', 'tutor_pay', 'tutorId', u.tutor_id)
FROM unambiguous u WHERE i.id = u.id;

CREATE INDEX IF NOT EXISTS invoices_org_tutor_pay_lookup
  ON public.invoices (organization_id, (pdf_meta->>'tutorId'), created_at DESC)
  WHERE pdf_meta->>'invoiceKind' = 'tutor_pay';

-- Restrictive policies still apply if a future permissive policy broadens access.
-- Parent/student access belongs to customer invoices, never tutor remuneration.
DROP POLICY IF EXISTS org_invoice_party_guard ON public.invoices;
CREATE POLICY org_invoice_party_guard ON public.invoices AS RESTRICTIVE FOR ALL TO authenticated
USING (
  organization_id IS NULL
  OR (pdf_meta->>'invoiceKind' = 'tutor_pay' AND pdf_meta->>'tutorId' = (SELECT auth.uid())::text)
  OR organization_id IN (SELECT oa.organization_id FROM public.organization_admins oa WHERE oa.user_id = (SELECT auth.uid()))
  OR (COALESCE(pdf_meta->>'invoiceKind', 'customer_sale') <> 'tutor_pay'
    AND (public.parent_can_view_sales_invoice(id) OR public.student_can_view_sales_invoice(id)))
)
WITH CHECK (
  organization_id IS NULL
  OR (pdf_meta->>'invoiceKind' = 'tutor_pay' AND pdf_meta->>'tutorId' = (SELECT auth.uid())::text)
  OR organization_id IN (SELECT oa.organization_id FROM public.organization_admins oa WHERE oa.user_id = (SELECT auth.uid()))
  OR (COALESCE(pdf_meta->>'invoiceKind', 'customer_sale') <> 'tutor_pay'
    AND (public.parent_can_view_sales_invoice(id) OR public.student_can_view_sales_invoice(id)))
);

-- Admins may issue a teacher's invoice on their behalf; the beneficiary can read it.
DROP POLICY IF EXISTS invoices_tutor_pay_select ON public.invoices;
CREATE POLICY invoices_tutor_pay_select ON public.invoices FOR SELECT TO authenticated
USING (pdf_meta->>'invoiceKind' = 'tutor_pay' AND pdf_meta->>'tutorId' = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS invoice_line_items_party_guard ON public.invoice_line_items;
CREATE POLICY invoice_line_items_party_guard ON public.invoice_line_items AS RESTRICTIVE FOR ALL TO authenticated
USING (invoice_id IN (SELECT i.id FROM public.invoices i))
WITH CHECK (invoice_id IN (SELECT i.id FROM public.invoices i));

DROP POLICY IF EXISTS invoice_line_items_tutor_pay_select ON public.invoice_line_items;
CREATE POLICY invoice_line_items_tutor_pay_select ON public.invoice_line_items FOR SELECT TO authenticated
USING (invoice_id IN (SELECT i.id FROM public.invoices i
  WHERE i.pdf_meta->>'invoiceKind' = 'tutor_pay' AND i.pdf_meta->>'tutorId' = (SELECT auth.uid())::text));

DROP POLICY IF EXISTS invoice_pdf_party_guard ON storage.objects;
CREATE POLICY invoice_pdf_party_guard ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
USING (bucket_id <> 'invoices' OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.pdf_storage_path = storage.objects.name))
WITH CHECK (bucket_id <> 'invoices' OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.pdf_storage_path = storage.objects.name));

DROP POLICY IF EXISTS "Tutors read own remuneration PDFs" ON storage.objects;
CREATE POLICY "Tutors read own remuneration PDFs" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'invoices' AND EXISTS (SELECT 1 FROM public.invoices i
  WHERE i.pdf_storage_path = storage.objects.name AND i.pdf_meta->>'invoiceKind' = 'tutor_pay'
    AND i.pdf_meta->>'tutorId' = (SELECT auth.uid())::text));
