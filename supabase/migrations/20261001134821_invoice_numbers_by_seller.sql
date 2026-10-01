-- An organization is the buyer of a tutor invoice and the seller of a customer
-- invoice. Their independent SF sequences must not share a uniqueness scope.
BEGIN;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS seller_user_id uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.invoices.seller_user_id IS
  'Personal seller account; NULL for organization-issued invoices. Distinct from the administrator who issues an invoice on behalf of a tutor.';

-- Identify legacy personal sellers from the issuer or the billed lessons.
-- Do not classify an organization's sales invoice as its tutor's invoice just
-- because automatic sales invoices were issued_by_user_id = tutor_id.
WITH candidate_users AS (
  SELECT id AS invoice_id, issued_by_user_id AS user_id FROM public.invoices
  UNION
  SELECT li.invoice_id, s.tutor_id
  FROM public.invoice_line_items li
  JOIN public.sessions s ON s.id = ANY(li.session_ids)
), personal_sellers AS (
  SELECT i.id, min(p.user_id::text)::uuid AS user_id
  FROM public.invoices i
  JOIN candidate_users c ON c.invoice_id = i.id
  JOIN public.invoice_profiles p ON p.user_id = c.user_id AND p.organization_id IS NULL
  JOIN public.profiles u ON u.id = p.user_id
  WHERE i.seller_user_id IS NULL
    AND (
      nullif(btrim(i.seller_snapshot->>'companyCode'), '') = nullif(btrim(p.company_code), '')
      OR nullif(btrim(i.seller_snapshot->>'activityNumber'), '') = nullif(btrim(p.activity_number), '')
      OR nullif(btrim(i.seller_snapshot->>'personalCode'), '') = nullif(btrim(p.personal_code), '')
      OR nullif(lower(btrim(i.seller_snapshot->>'name')), '') = nullif(lower(btrim(
        CASE WHEN p.entity_type IN ('mb', 'uab', 'ii') THEN p.business_name
          ELSE coalesce(nullif(btrim(u.full_name), ''), p.business_name) END
      )), '')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.invoice_profiles org
      WHERE org.organization_id = i.organization_id
        AND (
          nullif(btrim(i.seller_snapshot->>'companyCode'), '') = nullif(btrim(org.company_code), '')
          OR nullif(lower(btrim(i.seller_snapshot->>'name')), '') = nullif(lower(btrim(org.business_name)), '')
        )
    )
  GROUP BY i.id
  HAVING count(DISTINCT p.user_id) = 1
)
UPDATE public.invoices i SET seller_user_id = p.user_id
FROM personal_sellers p WHERE i.id = p.id;

DROP INDEX IF EXISTS public.uq_invoices_org_invoice_number;
CREATE UNIQUE INDEX uq_invoices_org_invoice_number
  ON public.invoices(organization_id, invoice_number)
  WHERE organization_id IS NOT NULL AND seller_user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_personal_seller_invoice_number
  ON public.invoices(seller_user_id, invoice_number)
  WHERE seller_user_id IS NOT NULL;

COMMIT;
